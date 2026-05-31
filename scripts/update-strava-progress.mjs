import 'dotenv/config'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLUB_ID = process.env.STRAVA_CLUB_ID ?? '2149513'
const PER_PAGE = 200
const MAX_PAGES = 3
const METERS_PER_MILE = 1609.344
const RIDE_TYPES = new Set([
  'Ride',
  'VirtualRide',
  'MountainBikeRide',
  'GravelRide',
  'EBikeRide',
  'EMountainBikeRide',
])
const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const LEDGER_PATH = join(ROOT_DIR, 'data', 'strava-progress.json')
const PUBLIC_PROGRESS_PATH = join(ROOT_DIR, 'public', 'progress.json')
const DIST_PROGRESS_PATH = join(ROOT_DIR, 'dist', 'progress.json')
const TOKEN_CACHE_PATH = join(ROOT_DIR, 'data', 'strava-token.json')
const ENCRYPTED_TOKEN_CACHE_PATH = join(ROOT_DIR, 'data', 'strava-token.enc')

function hashValue(value) {
  return createHash('sha256').update(value).digest('hex')
}

function encryptionKey() {
  if (!process.env.STRAVA_TOKEN_CACHE_KEY) {
    return null
  }

  return createHash('sha256').update(process.env.STRAVA_TOKEN_CACHE_KEY).digest()
}

function compactValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

function fixedNumber(value, digits) {
  const numberValue = Number(value)

  return Number.isFinite(numberValue) ? numberValue.toFixed(digits) : ''
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback
    }

    if (error instanceof SyntaxError) {
      throw new SyntaxError(`Unable to parse JSON in ${path}: ${error.message}`)
    }

    throw error
  }
}

async function writeJson(path, value) {
  const tmpPath = `${path}.tmp`

  await mkdir(dirname(path), { recursive: true })
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tmpPath, path)
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function readTokenCache() {
  const key = encryptionKey()

  if (!key) {
    return readJson(TOKEN_CACHE_PATH, null)
  }

  try {
    const encryptedValue = JSON.parse(await readFile(ENCRYPTED_TOKEN_CACHE_PATH, 'utf8'))
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedValue.iv, 'base64'),
    )

    decipher.setAuthTag(Buffer.from(encryptedValue.authTag, 'base64'))

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue.ciphertext, 'base64')),
      decipher.final(),
    ])

    return JSON.parse(decrypted.toString('utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function writeTokenCache(token) {
  const key = encryptionKey()

  if (!key) {
    await writeJson(TOKEN_CACHE_PATH, token)
    return
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(token), 'utf8'),
    cipher.final(),
  ])
  const encryptedValue = {
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }

  await mkdir(dirname(ENCRYPTED_TOKEN_CACHE_PATH), { recursive: true })
  await writeFile(ENCRYPTED_TOKEN_CACHE_PATH, `${JSON.stringify(encryptedValue, null, 2)}\n`)
}

async function getAccessToken() {
  if (process.env.STRAVA_ACCESS_TOKEN) {
    return process.env.STRAVA_ACCESS_TOKEN
  }

  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env
  const cachedToken = await readTokenCache()
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

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to refresh Strava token: ${response.status} ${await response.text()}`)
  }

  const token = await response.json()
  await writeTokenCache(token)
  return token.access_token
}

async function fetchClubActivities(accessToken) {
  const activities = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`https://www.strava.com/api/v3/clubs/${CLUB_ID}/activities`)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(PER_PAGE))

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    })

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

const progressState = await readJson(LEDGER_PATH, {
  clubId: CLUB_ID,
  totalDistanceMeters: 0,
  activityCount: 0,
  lastActivityKey: null,
  lastUpdated: null,
})

const accessToken = await getAccessToken()
const fetchedActivities = await fetchClubActivities(accessToken)
const rideActivities = fetchedActivities.map(normalizeActivity).filter(Boolean)
let newActivityCount = 0
let newDistanceMeters = 0
let foundPreviousCheckpoint = !progressState.lastActivityKey

for (const activity of rideActivities) {
  if (activity.key === progressState.lastActivityKey || activity.rawKey === progressState.lastActivityKey) {
    foundPreviousCheckpoint = true
    break
  }

  newDistanceMeters += activity.distanceMeters
  newActivityCount += 1
}

if (!foundPreviousCheckpoint) {
  throw new Error(
    'The previous lastActivityKey was not found in recent Strava club activities. Poll more often or reset data/strava-progress.json manually to avoid double-counting.',
  )
}

progressState.clubId = CLUB_ID
progressState.totalDistanceMeters = (Number(progressState.totalDistanceMeters) || 0) + newDistanceMeters
progressState.activityCount = (Number(progressState.activityCount) || 0) + newActivityCount
progressState.lastActivityKey = rideActivities[0]?.key ?? progressState.lastActivityKey
progressState.lastUpdated = new Date().toISOString()

const publicProgress = {
  clubId: CLUB_ID,
  totalDistanceMeters: progressState.totalDistanceMeters,
  totalMiles: progressState.totalDistanceMeters / METERS_PER_MILE,
  activityCount: progressState.activityCount,
  lastUpdated: progressState.lastUpdated,
}

await writeJson(LEDGER_PATH, progressState)
await writeJson(PUBLIC_PROGRESS_PATH, publicProgress)
if (await pathExists(DIST_PROGRESS_PATH)) {
  await writeJson(DIST_PROGRESS_PATH, publicProgress)
}

console.log(
  `Added ${newActivityCount} new activities (${(newDistanceMeters / METERS_PER_MILE).toFixed(
    2,
  )} miles). Total: ${publicProgress.totalMiles.toFixed(2)} miles.`,
)
