import 'dotenv/config'
import { createFileStorage } from '../lib/storage-file.mjs'
import { createRedisStorage } from '../lib/storage-redis.mjs'

/**
 * One-time migration: copy the locally committed ledger / token / public
 * progress into Upstash Redis so the serverless cron continues the running
 * total instead of resetting it.
 *
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the
 * environment (pull them from the Vercel project, e.g. `vercel env pull`).
 */
const file = createFileStorage(process.env)
const redis = createRedisStorage()

const ledger = await file.readLedger()
const token = await file.readToken()
const progress = await file.readProgress()

if (!ledger) {
  console.warn('No local ledger found at data/strava-progress.json; seeding from scratch.')
} else {
  await redis.writeLedger(ledger)
  console.log(
    `Seeded ledger: ${ledger.activityCount} activities, ${ledger.totalDistanceMeters} meters.`,
  )
}

if (progress) {
  await redis.writeProgress(progress)
  console.log(`Seeded public progress: ${progress.totalMiles?.toFixed?.(2) ?? '?'} miles.`)
}

if (token) {
  await redis.writeToken(token)
  console.log('Seeded cached Strava token.')
} else {
  console.log('No cached token to seed; the first run will refresh using STRAVA_REFRESH_TOKEN.')
}

console.log('Upstash seed complete.')
