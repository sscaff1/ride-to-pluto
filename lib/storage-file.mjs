import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const LEDGER_PATH = join(ROOT_DIR, 'data', 'strava-progress.json')
const PUBLIC_PROGRESS_PATH = join(ROOT_DIR, 'public', 'progress.json')
const DIST_PROGRESS_PATH = join(ROOT_DIR, 'dist', 'progress.json')
const TOKEN_CACHE_PATH = join(ROOT_DIR, 'data', 'strava-token.json')
const ENCRYPTED_TOKEN_CACHE_PATH = join(ROOT_DIR, 'data', 'strava-token.enc')

function encryptionKey(env) {
  if (!env.STRAVA_TOKEN_CACHE_KEY) {
    return null
  }

  return createHash('sha256').update(env.STRAVA_TOKEN_CACHE_KEY).digest()
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback
    }

    if (error instanceof SyntaxError) {
      throw new SyntaxError(`Unable to parse JSON in ${path}: ${error.message}`)
    }

    throw error
  }
}

async function writeJson(path, value) {
  const tmpPath = `${path}.tmp`

  await mkdir(dirname(path), { recursive: true })
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(tmpPath, path)
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

/**
 * File-backed storage used by the local CLI. Preserves the original on-disk
 * layout, including optional AES-256-GCM token encryption.
 */
export function createFileStorage(env = process.env) {
  return {
    readLedger() {
      return readJson(LEDGER_PATH, null)
    },

    writeLedger(value) {
      return writeJson(LEDGER_PATH, value)
    },

    async readToken() {
      const key = encryptionKey(env)

      if (!key) {
        return readJson(TOKEN_CACHE_PATH, null)
      }

      try {
        const encryptedValue = JSON.parse(await readFile(ENCRYPTED_TOKEN_CACHE_PATH, 'utf8'))
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(encryptedValue.iv, 'base64'),
        )

        decipher.setAuthTag(Buffer.from(encryptedValue.authTag, 'base64'))

        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(encryptedValue.ciphertext, 'base64')),
          decipher.final(),
        ])

        return JSON.parse(decrypted.toString('utf8'))
      } catch (error) {
        if (error.code === 'ENOENT') {
          return null
        }

        throw error
      }
    },

    async writeToken(token) {
      const key = encryptionKey(env)

      if (!key) {
        await writeJson(TOKEN_CACHE_PATH, token)
        return
      }

      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(token), 'utf8'),
        cipher.final(),
      ])
      const encryptedValue = {
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }

      await mkdir(dirname(ENCRYPTED_TOKEN_CACHE_PATH), { recursive: true })
      await writeFile(
        ENCRYPTED_TOKEN_CACHE_PATH,
        `${JSON.stringify(encryptedValue, null, 2)}\n`,
      )
    },

    readProgress() {
      return readJson(PUBLIC_PROGRESS_PATH, null)
    },

    async writeProgress(value) {
      await writeJson(PUBLIC_PROGRESS_PATH, value)
      if (await pathExists(DIST_PROGRESS_PATH)) {
        await writeJson(DIST_PROGRESS_PATH, value)
      }
    },
  }
}
