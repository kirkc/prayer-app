import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { connect, type ClientHttp2Session } from 'node:http2'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

// Direct APNs over HTTP/2 with token-based auth (.p8) — no push broker.
// fetch/undici can't speak HTTP/2, but Vercel functions run real Node where
// node:http2 works for outbound connections (verified by spike against the
// sandbox gateway before this shipped).

const KEY_ID = process.env.APNS_KEY_ID
const TEAM_ID = process.env.APNS_TEAM_ID
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? 'org.redemptionseattle.prayerteam'

function privateKey(): string {
  // Vercel holds the PEM in the env var; local dev points at the .p8 file
  // (gitignored) so the key never lives in two places.
  if (process.env.APNS_PRIVATE_KEY) return process.env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n')
  if (process.env.APNS_PRIVATE_KEY_PATH) return readFileSync(process.env.APNS_PRIVATE_KEY_PATH, 'utf8')
  throw new Error('APNS_PRIVATE_KEY(_PATH) is not set')
}

export function apnsConfigured(): boolean {
  return Boolean(KEY_ID && TEAM_ID && (process.env.APNS_PRIVATE_KEY || process.env.APNS_PRIVATE_KEY_PATH))
}

// Apple wants provider tokens refreshed between 20 and 60 minutes; cache for
// 40. Module scope survives across invocations of a warm lambda.
let cachedJwt: { token: string; issuedAt: number } | null = null

function providerJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  if (cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.token

  const b64url = (s: string) => Buffer.from(s).toString('base64url')
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }))
  const claims = b64url(JSON.stringify({ iss: TEAM_ID, iat: now }))
  const signature = createSign('sha256')
    .update(`${header}.${claims}`)
    .sign({ key: privateKey(), dsaEncoding: 'ieee-p1363' })
    .toString('base64url')

  cachedJwt = { token: `${header}.${claims}.${signature}`, issuedAt: now }
  return cachedJwt.token
}

const HOSTS = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
} as const

type PushInput = {
  token: string
  environment: 'sandbox' | 'production'
  title: string
  body: string
  // Delivered inside the payload for deep-linking (e.g. { request_id }).
  data?: Record<string, string>
  threadId?: string
}

type PushResult = { ok: true } | { ok: false; status: number; reason: string }

function sendOnce(session: ClientHttp2Session, input: PushInput): Promise<PushResult> {
  return new Promise(resolve => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${input.token}`,
      authorization: `bearer ${providerJwt()}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    })
    let status = 0
    let body = ''
    req.on('response', headers => { status = Number(headers[':status'] ?? 0) })
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      if (status === 200) return resolve({ ok: true })
      let reason = 'Unknown'
      try { reason = JSON.parse(body).reason ?? reason } catch { /* keep Unknown */ }
      resolve({ ok: false, status, reason })
    })
    req.on('error', err => resolve({ ok: false, status: 0, reason: err.message }))
    req.end(JSON.stringify({
      aps: {
        alert: { title: input.title, body: input.body },
        sound: 'default',
        'thread-id': input.threadId,
      },
      ...input.data,
    }))
  })
}

// Send one push per device. Tokens Apple declares dead are deleted so the
// table self-heals. Never throws — push is best-effort alongside email.
export async function sendPushes(inputs: PushInput[]): Promise<{ sent: number; failed: number }> {
  if (inputs.length === 0 || !apnsConfigured()) return { sent: 0, failed: 0 }

  const byHost = new Map<string, PushInput[]>()
  for (const input of inputs) {
    const host = HOSTS[input.environment]
    byHost.set(host, [...(byHost.get(host) ?? []), input])
  }

  let sent = 0
  let failed = 0
  const dead: string[] = []

  for (const [host, group] of byHost) {
    const session = connect(host)
    const sessionFailed = new Promise<void>(resolve => session.on('error', () => resolve()))
    try {
      for (const input of group) {
        const result = await Promise.race([
          sendOnce(session, input),
          sessionFailed.then((): PushResult => ({ ok: false, status: 0, reason: 'session error' })),
        ])
        if (result.ok) {
          sent++
        } else {
          failed++
          if (result.status === 410 || result.reason === 'BadDeviceToken' || result.reason === 'Unregistered') {
            dead.push(input.token)
          } else {
            await logError('push.send', new Error(result.reason), { status: result.status })
          }
        }
      }
    } finally {
      session.close()
    }
  }

  if (dead.length > 0) {
    const service = createServiceClient()
    await service.from('device_tokens').delete().in('token', dead)
  }

  return { sent, failed }
}
