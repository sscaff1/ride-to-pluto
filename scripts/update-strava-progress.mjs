import 'dotenv/config'
import { runUpdate, METERS_PER_MILE } from '../lib/strava-core.mjs'
import { createFileStorage } from '../lib/storage-file.mjs'

const storage = createFileStorage(process.env)
const { newActivityCount, newDistanceMeters, publicProgress } = await runUpdate({
  storage,
  env: process.env,
})

console.log(
  `Added ${newActivityCount} new activities (${(newDistanceMeters / METERS_PER_MILE).toFixed(
    2,
  )} miles). Total: ${publicProgress.totalMiles.toFixed(2)} miles.`,
)
