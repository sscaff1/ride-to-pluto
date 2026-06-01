import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createRedisStorage } from '../lib/storage-redis.ts'

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const storage = createRedisStorage()
    const progress = await storage.readProgress()

    if (!progress) {
      res.status(404).json({ error: 'No progress recorded yet.' })
      return
    }

    res.setHeader('cache-control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
    res.status(200).json(progress)
  } catch (error) {
    console.error('Failed to read progress:', error)
    res.status(500).json({ error: (error as Error).message })
  }
}
