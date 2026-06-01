import { appTemplate } from './appTemplate'

type SolarBody = {
  name: string
  kind: 'star' | 'planet' | 'dwarf-planet'
  distanceAu: number
  diameterKm: number
  color: string
}

const KM_PER_AU = 149_597_870.7
const KM_PER_MILE = 1.609344
const MAP_TRACK_WIDTH_PX = 7_600
const MAP_SIDE_PADDING_PX = 72
const JUPITER_VISUAL_DIAMETER_PX = 46
const SUN_VISUAL_DIAMETER_PX = 82
const MIN_PLANET_VISUAL_DIAMETER_PX = 8
const UPDATE_INTERVAL_MINUTES = 5

const FALLBACK_BIKED_MILES = 1_250_000_000

const solarBodies: SolarBody[] = [
  { name: 'Sun', kind: 'star', distanceAu: 0, diameterKm: 1_392_700, color: '#ffd166' },
  { name: 'Mercury', kind: 'planet', distanceAu: 0.387, diameterKm: 4_879, color: '#a7a7a7' },
  { name: 'Venus', kind: 'planet', distanceAu: 0.723, diameterKm: 12_104, color: '#e6b35a' },
  { name: 'Earth', kind: 'planet', distanceAu: 1, diameterKm: 12_742, color: '#4f8cff' },
  { name: 'Mars', kind: 'planet', distanceAu: 1.524, diameterKm: 6_779, color: '#d85c45' },
  { name: 'Jupiter', kind: 'planet', distanceAu: 5.203, diameterKm: 139_820, color: '#d9aa75' },
  { name: 'Saturn', kind: 'planet', distanceAu: 9.537, diameterKm: 116_460, color: '#e8cf8b' },
  { name: 'Uranus', kind: 'planet', distanceAu: 19.191, diameterKm: 50_724, color: '#8dd7df' },
  { name: 'Neptune', kind: 'planet', distanceAu: 30.07, diameterKm: 49_244, color: '#466bd9' },
  { name: 'Pluto', kind: 'dwarf-planet', distanceAu: 39.482, diameterKm: 2_376, color: '#c8b6a6' },
]

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})
const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
type DistanceUnit = 'miles' | 'km'
type ProgressSnapshot = {
  totalDistanceMeters?: number
  totalMiles?: number
  activityCount?: number
  lastUpdated?: string
}

let distanceUnit: DistanceUnit = 'miles'

const earth = solarBodies.find((body) => body.name === 'Earth')!
const pluto = solarBodies.find((body) => body.name === 'Pluto')!
const plutoDistanceKm = pluto.distanceAu * KM_PER_AU
const earthDistanceKm = earth.distanceAu * KM_PER_AU
const earthToPlutoKm = plutoDistanceKm - earthDistanceKm
const mapWidthPx = MAP_TRACK_WIDTH_PX + MAP_SIDE_PADDING_PX * 2
const planetDiameterScale = JUPITER_VISUAL_DIAMETER_PX / 139_820

function distanceFromSunToX(distanceKm: number) {
  return MAP_SIDE_PADDING_PX + (distanceKm / plutoDistanceKm) * MAP_TRACK_WIDTH_PX
}

function bodyDiameterPx(body: SolarBody) {
  if (body.kind === 'star') {
    return SUN_VISUAL_DIAMETER_PX
  }

  return Math.max(body.diameterKm * planetDiameterScale, MIN_PLANET_VISUAL_DIAMETER_PX)
}

function formatMilesFromKm(km: number) {
  return `${numberFormatter.format(km / KM_PER_MILE)} miles`
}

function formatDistance(km: number, unit = distanceUnit) {
  if (unit === 'km') {
    return `${numberFormatter.format(km)} km`
  }

  return formatMilesFromKm(km)
}

function formatAu(au: number) {
  return `${au.toFixed(3).replace(/\.?0+$/, '')} AU`
}

function progressSnapshotToKm(snapshot: ProgressSnapshot | null) {
  if (snapshot?.totalDistanceMeters !== undefined) {
    return snapshot.totalDistanceMeters / 1_000
  }

  if (snapshot?.totalMiles !== undefined) {
    return snapshot.totalMiles * KM_PER_MILE
  }

  return FALLBACK_BIKED_MILES * KM_PER_MILE
}

function formatTimestamp(value: Date | string | undefined) {
  if (!value) {
    return 'Not available yet'
  }

  return dateTimeFormatter.format(new Date(value))
}

function nextScheduledUpdate(from = new Date()) {
  const next = new Date(from)
  const minutes = next.getMinutes()
  const minutesToAdd = UPDATE_INTERVAL_MINUTES - (minutes % UPDATE_INTERVAL_MINUTES)

  next.setSeconds(0, 0)
  next.setMinutes(minutes + minutesToAdd)

  return next
}

function bodyMarkup(body: SolarBody, index: number) {
  const distanceKm = body.distanceAu * KM_PER_AU
  const positionPx = distanceFromSunToX(distanceKm)
  const diameterPx = bodyDiameterPx(body)
  const labelClass = index % 2 === 0 ? 'is-above' : 'is-below'
  const distanceLabel = body.kind === 'star' ? '0 AU from center' : `${formatAu(body.distanceAu)} from Sun`
  const scaleNote = body.kind === 'star' ? 'Sun visually reduced' : `${numberFormatter.format(body.diameterKm)} km wide`

  return `
    <article
      class="solar-body solar-body--${body.kind} ${labelClass}"
      style="--x: ${positionPx}px; --diameter: ${diameterPx}px; --body-color: ${body.color};"
      aria-label="${body.name}, ${distanceLabel}, ${scaleNote}"
    >
      <div class="solar-body__label">
        <strong>${body.name}</strong>
        <span>${distanceLabel}</span>
      </div>
      <div class="solar-body__stem" aria-hidden="true"></div>
      <div class="solar-body__dot" aria-hidden="true"></div>
    </article>
  `
}

const earthX = distanceFromSunToX(earthDistanceKm)

function element<T extends HTMLElement>(selector: string) {
  const match = document.querySelector<T>(selector)

  if (!match) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return match
}

function setDistanceElement(target: HTMLElement, distanceKm: number) {
  target.dataset.distanceKm = String(distanceKm)
  target.textContent = formatDistance(distanceKm)
}

function updateDistanceLabels() {
  document.querySelectorAll<HTMLElement>('[data-distance-km]').forEach((element) => {
    const distanceKm = Number(element.dataset.distanceKm)

    if (Number.isFinite(distanceKm)) {
      element.textContent = formatDistance(distanceKm)
    }
  })

  const unitToggle = document.querySelector<HTMLButtonElement>('#unit-toggle')
  if (unitToggle) {
    unitToggle.textContent = distanceUnit === 'miles' ? 'Show km' : 'Show miles'
    unitToggle.setAttribute(
      'aria-label',
      distanceUnit === 'miles' ? 'Switch distances to kilometers' : 'Switch distances to miles',
    )
  }
}

async function fetchProgress(url: string) {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as ProgressSnapshot
}

async function loadProgressSnapshot() {
  // Prefer the live serverless endpoint (backed by Upstash, updated by the
  // scheduled cron). Fall back to the static build-time file if it is missing
  // (e.g. local `vite preview` without serverless functions).
  try {
    const live = await fetchProgress('/api/progress')
    if (live) {
      return live
    }
  } catch {
    // Ignore and fall back to the static snapshot below.
  }

  try {
    return await fetchProgress('/progress.json')
  } catch {
    return null
  }
}

function renderApp(progressSnapshot: ProgressSnapshot | null) {
  element<HTMLDivElement>('#app').innerHTML = appTemplate

  const currentBikedKm = progressSnapshotToKm(progressSnapshot)
  const cappedBikedKm = Math.min(currentBikedKm, earthToPlutoKm)
  const progressFraction = cappedBikedKm / earthToPlutoKm
  const progressPercent = progressFraction * 100
  const progressDistanceFromSunKm = earthDistanceKm + cappedBikedKm
  const progressX = distanceFromSunToX(progressDistanceFromSunKm)
  const remainingKm = earthToPlutoKm - cappedBikedKm
  const progressLineWidthPx = Math.max(progressX - earthX, 2)
  const progressSource = progressSnapshot
    ? `${progressSnapshot.activityCount ?? 0} Strava club activities counted`
    : 'Fallback mileage'
  const nextUpdate = nextScheduledUpdate()

  setDistanceElement(element('#current-distance'), currentBikedKm)
  setDistanceElement(element('#bike-distance'), currentBikedKm)
  setDistanceElement(element('#route-target'), earthToPlutoKm)

  const progressPercentText = `${percentFormatter.format(progressPercent)}% complete`
  element('#progress-percent').textContent = progressPercentText
  element('#progress-bar').setAttribute('aria-label', progressPercentText)
  element('#progress-bar-fill').style.transform = `scaleX(${progressFraction})`

  const remainingDistance = element('#remaining-distance')
  const remainingSuffix = element('#remaining-suffix')
  if (progressFraction >= 1) {
    remainingDistance.textContent = 'Destination reached'
    delete remainingDistance.dataset.distanceKm
    remainingSuffix.textContent = ''
  } else {
    setDistanceElement(remainingDistance, remainingKm)
    remainingSuffix.textContent = ' left'
  }

  const canvas = element('#solar-canvas')
  canvas.style.width = `${mapWidthPx}px`

  const axis = element('#solar-axis')
  axis.style.left = `${MAP_SIDE_PADDING_PX}px`
  axis.style.width = `${MAP_TRACK_WIDTH_PX}px`

  const earthProgressLine = element('#earth-progress-line')
  earthProgressLine.style.left = `${earthX}px`
  earthProgressLine.style.width = `${progressLineWidthPx}px`

  element('#solar-bodies').innerHTML = solarBodies.map(bodyMarkup).join('')

  const bikeMarker = element('#bike-marker')
  bikeMarker.style.setProperty('--x', `${progressX}px`)
  bikeMarker.setAttribute(
    'aria-label',
    `Bike progress marker, ${formatDistance(currentBikedKm)} from Earth toward Pluto`,
  )

  element('#pluto-distance').textContent = `${numberFormatter.format(plutoDistanceKm)} km`
  element('#progress-source').textContent = progressSource
  element('#last-updated').textContent = formatTimestamp(progressSnapshot?.lastUpdated)
  element('#next-update').textContent = formatTimestamp(nextUpdate)

  document.querySelector<HTMLButtonElement>('#unit-toggle')?.addEventListener('click', () => {
    distanceUnit = distanceUnit === 'miles' ? 'km' : 'miles'
    updateDistanceLabels()
  })
}

renderApp(await loadProgressSnapshot())
