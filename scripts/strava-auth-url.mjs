import 'dotenv/config'

const { STRAVA_CLIENT_ID, STRAVA_REDIRECT_URI = 'http://localhost' } = process.env

if (!STRAVA_CLIENT_ID) {
  throw new Error('Set STRAVA_CLIENT_ID in .env before generating the Strava authorization URL.')
}

const url = new URL('https://www.strava.com/oauth/authorize')
url.searchParams.set('client_id', STRAVA_CLIENT_ID)
url.searchParams.set('redirect_uri', STRAVA_REDIRECT_URI)
url.searchParams.set('response_type', 'code')
url.searchParams.set('approval_prompt', 'force')
url.searchParams.set('scope', 'read')

console.log(url.toString())
