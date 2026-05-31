import './style.css'

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
const MAP_SIDE_PADDING_PX = 180
const JUPITER_VISUAL_DIAMETER_PX = 46
const SUN_VISUAL_DIAMETER_PX = 82
const MIN_PLANET_VISUAL_DIAMETER_PX = 8

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

function formatUpdatedAt(value: string | undefined) {
  if (!value) {
    return 'Progress is using the fallback mileage until Strava data is generated.'
  }

  return `Last Strava update: ${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))}`
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

async function loadProgressSnapshot() {
  try {
    const response = await fetch('/progress.json', { cache: 'no-store' })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as ProgressSnapshot
  } catch {
    return null
  }
}

function renderApp(progressSnapshot: ProgressSnapshot | null) {
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

  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">Bike to Pluto</p>
        <h1>Solar System progress map</h1>
      </div>
      <div class="progress-summary" aria-label="Ride progress summary">
        <strong data-distance-km="${currentBikedKm}">${formatDistance(currentBikedKm)}</strong>
        <span>${percentFormatter.format(progressPercent)}% complete</span>
        <div class="progress-bar" aria-label="${percentFormatter.format(progressPercent)} percent complete">
          <span style="transform: scaleX(${progressFraction});"></span>
        </div>
      </div>
      <button id="unit-toggle" class="unit-toggle" type="button" aria-label="Switch distances to kilometers">
        Show km
      </button>
    </header>

    <section class="map-card" aria-labelledby="map-title">
      <div class="map-card__header">
        <div>
          <h2 id="map-title">
            Earth to Pluto:
            ${
              progressFraction >= 1
                ? 'Destination reached'
                : `<span data-distance-km="${remainingKm}">${formatDistance(remainingKm)}</span> left`
            }
          </h2>
        </div>
        <p>Scroll sideways to see the full line.</p>
      </div>

      <div class="solar-map" role="img" aria-label="Linear map of the Solar System with biking progress from Earth toward Pluto">
        <div class="solar-map__scroller">
          <div class="solar-map__canvas" style="width: ${mapWidthPx}px;">
            <div
              class="solar-map__axis"
              style="left: ${MAP_SIDE_PADDING_PX}px; width: ${MAP_TRACK_WIDTH_PX}px;"
              aria-hidden="true"
            ></div>
            <div
              class="earth-progress-line"
              style="left: ${earthX}px; width: ${progressLineWidthPx}px;"
              aria-hidden="true"
            ></div>
            ${solarBodies.map(bodyMarkup).join('')}
            <article
              class="bike-marker"
              style="--x: ${progressX}px;"
              aria-label="Bike progress marker, ${formatDistance(currentBikedKm)} from Earth toward Pluto"
            >
              <div class="bike-marker__label">
                <strong>Bike group</strong>
                <span><span data-distance-km="${currentBikedKm}">${formatDistance(currentBikedKm)}</span> from Earth</span>
              </div>
              <div class="bike-marker__pin" aria-hidden="true"></div>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="notes" aria-label="Scale notes">
      <p>
        Distances are average orbital distances from the Sun, scaled linearly from Sun to Pluto
        (${numberFormatter.format(plutoDistanceKm)} km). Planet diameters are proportional to each
        other, but small planets have a minimum visible size and the Sun is shown smaller than true
        scale so the map remains usable.
      </p>
      <p>
        Route target: <span data-distance-km="${earthToPlutoKm}">${formatDistance(earthToPlutoKm)}</span>
        from Earth to Pluto. ${progressSource}. ${formatUpdatedAt(progressSnapshot?.lastUpdated)}
      </p>
    </section>
  </main>
`

  document.querySelector<HTMLButtonElement>('#unit-toggle')?.addEventListener('click', () => {
    distanceUnit = distanceUnit === 'miles' ? 'km' : 'miles'
    updateDistanceLabels()
  })
}

renderApp(await loadProgressSnapshot())
