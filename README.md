# Ride to Pluto

A vanilla TypeScript/Vite solar-system progress map for a biking group.

## Strava Progress

The app reads ride progress from `public/progress.json`. Generate that file by polling Strava club `2149513`:

```sh
npm run strava:update
```

The update script keeps compact local progress state in `data/strava-progress.json`, counts bike-like Strava activity types, and writes the aggregate distance to `public/progress.json`.

Strava club activities do not include a stable activity ID or exact start timestamp. To avoid saving every activity forever, the script stores only the running total, activity count, last update time, and a hashed `lastActivityKey`. When the endpoint does not provide an ID, that key is a SHA-256 hash of a fingerprint made from athlete name, activity name, sport type, distance, moving time, elapsed time, and elevation gain.

On each run, the script adds activities until it reaches the previous `lastActivityKey`, then saves the newest activity key as the next checkpoint. If that checkpoint is no longer present in Strava's recent activity window, the script stops instead of guessing and risking double-counting.

The script uses `dotenv`, so local OAuth credentials can live in `.env`. Strava does not authenticate API requests with a permanent API key. Per Strava's docs, you authorize the app once, exchange the returned code for a refresh token, then use that refresh token to keep getting short-lived access tokens.

Create a Strava app, then set:

```sh
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REDIRECT_URI=http://localhost
```

Generate the authorization URL:

```sh
npm run strava:auth-url
```

Open the printed URL, approve access, and copy the `code` query parameter from the redirect URL into `.env`:

```sh
STRAVA_AUTH_CODE=...
```

Exchange that one-time code:

```sh
npm run strava:exchange-code
```

Copy the returned `refresh_token` into `.env`:

```sh
STRAVA_REFRESH_TOKEN=...
```

After that, `npm run strava:update` refreshes short-lived access tokens automatically and calls Strava with `Authorization: Bearer <access_token>`.

The refresh flow caches refreshed tokens in `data/strava-token.json` locally. You can also set `STRAVA_ACCESS_TOKEN` directly for a temporary six-hour token, but that is not suitable for scheduled updates.

To keep the mileage fresh, run `npm run strava:update` on a schedule with cron or another scheduler.

## GitHub Actions

The repository includes `.github/workflows/update-strava-progress.yml`, which runs once per hour and can also be started manually from the Actions tab. It updates Strava mileage and commits these files when they change:

- `public/progress.json`: public aggregate used by the app.
- `data/strava-progress.json`: compact non-secret checkpoint with total distance and hashed last activity key.
- `data/strava-token.enc`: encrypted OAuth token cache so Strava refresh-token rotation keeps working between GitHub Actions runs.

Add these repository secrets before enabling the workflow:

```sh
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...
STRAVA_TOKEN_CACHE_KEY=...
```

`STRAVA_REFRESH_TOKEN` seeds the first scheduled run. `STRAVA_TOKEN_CACHE_KEY` should be a long random value used to encrypt the token cache committed by the workflow.
