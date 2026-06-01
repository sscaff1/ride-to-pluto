import { Redis } from '@upstash/redis'

const LEDGER_KEY = 'strava:ledger'
const TOKEN_KEY = 'strava:token'
const PROGRESS_KEY = 'strava:progress'

/**
 * Upstash Redis-backed storage used by the Vercel serverless functions, where
 * the filesystem is read-only and not shared between invocations.
 *
 * Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from the environment
 * (provided automatically by the Vercel Upstash integration). The Upstash
 * client deserializes JSON values automatically, so we store plain objects.
 */
export function createRedisStorage() {
  const redis = Redis.fromEnv()

  return {
    async readLedger() {
      return (await redis.get(LEDGER_KEY)) ?? null
    },

    async writeLedger(value) {
      await redis.set(LEDGER_KEY, value)
    },

    async readToken() {
      return (await redis.get(TOKEN_KEY)) ?? null
    },

    async writeToken(token) {
      await redis.set(TOKEN_KEY, token)
    },

    async readProgress() {
      return (await redis.get(PROGRESS_KEY)) ?? null
    },

    async writeProgress(value) {
      await redis.set(PROGRESS_KEY, value)
    },
  }
}
