import 'dotenv/config'
import { METERS_PER_MILE, runUpdate } from '../lib/strava-core.ts'
import { createFileStorage } from '../lib/storage-file.ts'

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
