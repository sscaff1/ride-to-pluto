import 'dotenv/config'

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_AUTH_CODE } = process.env

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_AUTH_CODE) {
  throw new Error(
    'Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_AUTH_CODE in .env before exchanging the Strava authorization code.',
  )
}

const response = await fetch('https://www.strava.com/oauth/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    code: STRAVA_AUTH_CODE,
    grant_type: 'authorization_code',
  }),
})

if (!response.ok) {
  throw new Error(`Unable to exchange Strava authorization code: ${response.status} ${await response.text()}`)
}

const token = await response.json()

console.log(JSON.stringify({
  access_token: token.access_token,
  expires_at: token.expires_at,
  refresh_token: token.refresh_token,
  scope: token.scope,
}, null, 2))
