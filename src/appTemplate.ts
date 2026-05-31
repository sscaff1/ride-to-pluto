export const appTemplate = `
  <main class="app-shell">
    <header class="top-bar">
      <div>
        <p class="eyebrow">Ride to Pluto</p>
        <h1>Solar System progress map</h1>
      </div>
      <div class="progress-summary" aria-label="Ride progress summary">
        <strong id="current-distance"></strong>
        <span id="progress-percent"></span>
        <div id="progress-bar" class="progress-bar">
          <span id="progress-bar-fill"></span>
        </div>
      </div>
      <div class="top-actions">
        <button id="unit-toggle" class="unit-toggle" type="button" aria-label="Switch distances to kilometers">
          Show km
        </button>
        <a class="club-link" href="https://www.strava.com/clubs/2149513" target="_blank" rel="noreferrer">
          Join the Strava group
        </a>
      </div>
    </header>

    <section class="map-card" aria-labelledby="map-title">
      <div class="map-card__header">
        <div>
          <h2 id="map-title">
            Earth to Pluto:
            <span id="remaining-distance"></span><span id="remaining-suffix"></span>
          </h2>
        </div>
        <p>Scroll sideways to see the full line.</p>
      </div>

      <div class="solar-map" role="img" aria-label="Linear map of the Solar System with biking progress from Earth toward Pluto">
        <div class="solar-map__scroller">
          <div id="solar-canvas" class="solar-map__canvas">
            <div id="solar-axis" class="solar-map__axis" aria-hidden="true"></div>
            <div id="earth-progress-line" class="earth-progress-line" aria-hidden="true"></div>
            <div id="solar-bodies"></div>
            <article id="bike-marker" class="bike-marker">
              <div class="bike-marker__label">
                <strong>Bike group</strong>
                <span><span id="bike-distance"></span> from Earth</span>
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
        (<span id="pluto-distance"></span>). Planet diameters are proportional to each other, but
        small planets have a minimum visible size and the Sun is shown smaller than true scale so
        the map remains usable.
      </p>
      <p>
        Route target: <span id="route-target"></span> from Earth to Pluto.
        <span id="progress-source"></span>.
      </p>
      <div class="update-times" aria-label="Strava update times">
        <span><strong>Last updated</strong><span id="last-updated"></span></span>
        <span><strong>Next update</strong><span id="next-update"></span></span>
      </div>
    </section>
  </main>
`
