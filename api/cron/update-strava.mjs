import { runUpdate, METERS_PER_MILE } from '../../lib/strava-core.mjs'
import { createRedisStorage } from '../../lib/storage-redis.mjs'

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return false
  }

  const header = req.headers.authorization ?? ''
  return header === `Bearer ${secret}`
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const storage = createRedisStorage()
    const { newActivityCount, newDistanceMeters, publicProgress } = await runUpdate({
      storage,
      env: process.env,
    })

    res.status(200).json({
      ok: true,
      newActivityCount,
      newMiles: newDistanceMeters / METERS_PER_MILE,
      totalMiles: publicProgress.totalMiles,
      lastUpdated: publicProgress.lastUpdated,
    })
  } catch (error) {
    console.error('Strava update failed:', error)
    res.status(500).json({ ok: false, error: error.message })
  }
}
