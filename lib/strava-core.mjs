import { createHash } from 'node:crypto'

const PER_PAGE = 200
const MAX_PAGES = 3
const MAX_STRAVA_REQUEST_ATTEMPTS = 4
export const METERS_PER_MILE = 1609.344
const STRAVA_USER_AGENT = 'bike-to-pluto/0.0.0'
const RIDE_TYPES = new Set([
  'Ride',
  'VirtualRide',
  'MountainBikeRide',
  'GravelRide',
  'EBikeRide',
  'EMountainBikeRide',
])

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function retryDelayMs(response, attempt) {
  const retryAfterSeconds = Number(response.headers.get('retry-after'))

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000
  }

  return 5_000 * 3 ** (attempt - 1)
}

function shouldRetryStravaResponse(response) {
  return response.status === 403 || response.status === 429 || response.status >= 500
}

async function fetchStrava(url, options, label) {
  let lastResponse

  for (let attempt = 1; attempt <= MAX_STRAVA_REQUEST_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, options)
    lastResponse = response

    if (
      response.ok ||
      !shouldRetryStravaResponse(response) ||
      attempt === MAX_STRAVA_REQUEST_ATTEMPTS
    ) {
      return response
    }

    const delayMs = retryDelayMs(response, attempt)
    console.warn(
      `${label} returned ${response.status}; retrying in ${Math.round(delayMs / 1_000)}s (${attempt}/${MAX_STRAVA_REQUEST_ATTEMPTS}).`,
    )
    await response.arrayBuffer()
    await sleep(delayMs)
  }

  return lastResponse
}

function compactValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function fixedNumber(value, digits) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue.toFixed(digits) : ''
}

async function getAccessToken(storage, env) {
  if (env.STRAVA_ACCESS_TOKEN) {
    return env.STRAVA_ACCESS_TOKEN
  }

  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = env
  const cachedToken = await storage.readToken()
  const nowSeconds = Math.floor(Date.now() / 1000)

  if (cachedToken?.access_token && cachedToken.expires_at > nowSeconds + 60) {
    return cachedToken.access_token
  }

  const refreshToken = cachedToken?.refresh_token ?? STRAVA_REFRESH_TOKEN
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !refreshToken) {
    throw new Error(
      'Strava uses OAuth2. Set STRAVA_ACCESS_TOKEN for a short-lived token, or set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN for scheduled refreshes.',
    )
  }

  const response = await fetchStrava(
    'https://www.strava.com/oauth/token',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': STRAVA_USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    },
    'Strava token refresh',
  )

  if (!response.ok) {
    throw new Error(`Unable to refresh Strava token: ${response.status} ${await response.text()}`)
  }

  const token = await response.json()
  await storage.writeToken(token)
  return token.access_token
}

async function fetchClubActivities(accessToken, clubId) {
  const activities = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`https://www.strava.com/api/v3/clubs/${clubId}/activities`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(PER_PAGE))

    const response = await fetchStrava(
      url,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
          'user-agent': STRAVA_USER_AGENT,
        },
      },
      `Strava club activities page ${page}`,
    )

    if (!response.ok) {
      throw new Error(`Unable to fetch club activities: ${response.status} ${await response.text()}`)
    }

    const pageActivities = await response.json()
    if (!Array.isArray(pageActivities) || pageActivities.length === 0) {
      break
    }

    activities.push(...pageActivities)
  }

  return activities
}

function normalizeActivity(activity) {
  const activityType = activity.sport_type ?? activity.type
  const distanceMeters = Number(activity.distance)
  const athleteName = activity.athlete?.firstname
    ? `${activity.athlete.firstname} ${activity.athlete.lastname ?? ''}`.trim()
    : null

  if (!RIDE_TYPES.has(activityType) || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return null
  }

  const fingerprint = [
    compactValue(athleteName),
    compactValue(activity.name),
    compactValue(activityType),
    fixedNumber(distanceMeters, 1),
    fixedNumber(activity.moving_time, 0),
    fixedNumber(activity.elapsed_time, 0),
    fixedNumber(activity.total_elevation_gain, 1),
  ].join('|')

  return {
    key: hashValue(activity.id ? String(activity.id) : fingerprint),
    rawKey: activity.id ? String(activity.id) : fingerprint,
    distanceMeters,
  }
}

/**
 * Runs one Strava progress update against the provided storage adapter.
 * The storage adapter abstracts where ledger / token / public progress live
 * (local files for CLI runs, Upstash Redis for serverless runs).
 */
export async function runUpdate({ storage, env }) {
  const clubId = env.STRAVA_CLUB_ID ?? '2149513'

  const progressState = (await storage.readLedger()) ?? {
    clubId,
    totalDistanceMeters: 0,
    activityCount: 0,
    lastActivityKey: null,
    lastUpdated: null,
  }

  const accessToken = await getAccessToken(storage, env)
  const fetchedActivities = await fetchClubActivities(accessToken, clubId)
  const rideActivities = fetchedActivities.map(normalizeActivity).filter(Boolean)
  let newActivityCount = 0
  let newDistanceMeters = 0
  let foundPreviousCheckpoint = !progressState.lastActivityKey

  for (const activity of rideActivities) {
    if (
      activity.key === progressState.lastActivityKey ||
      activity.rawKey === progressState.lastActivityKey
    ) {
      foundPreviousCheckpoint = true
      break
    }

    newDistanceMeters += activity.distanceMeters
    newActivityCount += 1
  }

  if (!foundPreviousCheckpoint) {
    console.warn(
      'The previous lastActivityKey was not found in recent Strava club activities. Resyncing to the newest visible activity without adding distance to avoid double-counting.',
    )
    newActivityCount = 0
    newDistanceMeters = 0
  }

  progressState.clubId = clubId
  progressState.totalDistanceMeters =
    (Number(progressState.totalDistanceMeters) || 0) + newDistanceMeters
  progressState.activityCount = (Number(progressState.activityCount) || 0) + newActivityCount
  progressState.lastActivityKey = rideActivities[0]?.key ?? progressState.lastActivityKey
  progressState.lastUpdated = new Date().toISOString()

  const publicProgress = {
    clubId,
    totalDistanceMeters: progressState.totalDistanceMeters,
    totalMiles: progressState.totalDistanceMeters / METERS_PER_MILE,
    activityCount: progressState.activityCount,
    lastUpdated: progressState.lastUpdated,
  }

  await storage.writeLedger(progressState)
  await storage.writeProgress(publicProgress)

  return { newActivityCount, newDistanceMeters, publicProgress }
}
