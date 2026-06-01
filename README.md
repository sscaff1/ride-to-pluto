# Ride to Pluto

A vanilla TypeScript/Vite solar-system progress map for a biking group.

## Strava Progress

The app reads ride progress from `public/progress.json`. Generate that file by polling Strava club `2149513`:

```sh
npm run strava:update
```

The update script keeps compact local progress state in `data/strava-progress.json`, counts bike-like Strava activity types, and writes the aggregate distance to `public/progress.json`.

Strava club activities do not include a stable activity ID or exact start timestamp. To avoid saving every activity forever, the script stores only the running total, activity count, last update time, and a hashed `lastActivityKey`. When the endpoint does not provide an ID, that key is a SHA-256 hash of a fingerprint made from athlete name, activity name, sport type, distance, moving time, elapsed time, and elevation gain.

On each run, the script adds activities until it reaches the previous `lastActivityKey`, then saves the newest activity key as the next checkpoint. If that checkpoint is no longer present in Strava's recent activity window, the script resyncs to the newest visible activity without adding distance from that ambiguous batch, avoiding double-counting while allowing future runs to recover.

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

## Scheduled updates on Vercel (every 5 minutes)

The app is deployed on Vercel. Because the Vercel **Hobby** plan caps native cron jobs at once per day, the schedule is driven by an external scheduler that pings a serverless route. Serverless functions also have no persistent filesystem, so state lives in **Upstash Redis** instead of git-committed JSON files.

Data flow:

- `api/cron/update-strava.ts`: serverless function that runs one Strava update. It reads/writes the ledger, the rotating OAuth token, and the public progress in Upstash. Protected by `CRON_SECRET`.
- `api/progress.ts`: serverless function the frontend fetches at `/api/progress`. The app falls back to the static `public/progress.json` if the endpoint is unavailable.
- Shared logic lives in `lib/strava-core.ts`; storage backends are `lib/storage-file.ts` (local CLI) and `lib/storage-redis.ts` (serverless). Run `npm run typecheck` to type-check the serverless/CLI code (`tsconfig.server.json`).

### Setup

1. Add the Upstash integration to the Vercel project (Storage → Upstash Redis). This injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. Add these Vercel environment variables:

```sh
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REFRESH_TOKEN=...   # seeds the first token refresh
CRON_SECRET=...            # long random string
```

3. Seed Upstash with the current running total so it does not reset:

```sh
vercel env pull .env.vercel        # gets the Upstash REST credentials locally
npm run strava:seed-upstash        # copies data/strava-progress.json into Redis
```

4. Point an external scheduler (e.g. [cron-job.org](https://cron-job.org), Cloudflare Worker Cron, or Upstash QStash) at the deployed route every 5 minutes:

```
POST https://<your-domain>/api/cron/update-strava
Header: Authorization: Bearer <CRON_SECRET>
```

These free schedulers fire far more punctually than GitHub Actions' best-effort `schedule` trigger. If you upgrade to Vercel Pro, you can instead add a `vercel.json` `crons` entry with `"schedule": "*/5 * * * *"` and drop the external scheduler; the route already honors the `Authorization: Bearer <CRON_SECRET>` header Vercel sends.

The local `npm run strava:update` command still works for manual/local runs and writes to `data/` and `public/` via the file storage backend.
