#!/usr/bin/env node
// Bearer-token API verification for the iOS client (plan Phase 6).
//
// Creates a throwaway org + member + requests, signs in via the password
// grant, and exercises every endpoint the app will call with an
// `Authorization: Bearer` header — plus a cross-org 404 probe and a
// pagination walk. Cleans up after itself.
//
//   BASE_URL=http://localhost:3005 node scripts/verify-ios-api.mjs
//
// Reads Supabase env from .env.local like verify-org-isolation.mjs. Needs the
// Next.js server running at BASE_URL (defaults to the local dev server).

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

function loadEnv() {
  const out = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !out[m[1]]) out[m[1]] = m[2]
    }
  } catch { /* env may be provided directly */ }
  return out
}
const env = loadEnv()
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const BASE = (env.BASE_URL ?? 'http://localhost:3005').replace(/\/$/, '')
if (!SUPA || !ANON || !SERVICE) {
  console.error('Missing Supabase env (URL / anon key / service key)')
  process.exit(2)
}

const svcHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}
async function svc(path, init = {}) {
  const res = await fetch(`${SUPA}${path}`, { ...init, headers: { ...svcHeaders, ...init.headers } })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// --- fixtures -------------------------------------------------------------
const STAMP = randomUUID().slice(0, 8)
console.log('Setting up fixtures…')

const { body: [org] } = await svc('/rest/v1/organizations?select=id,slug', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ slug: `ios-probe-${STAMP}`, name: 'iOS Probe Org' }),
})

const email = `ios-probe-${STAMP}@example.com`
const password = `Probe-${randomUUID()}`
const { status: userStatus, body: user } = await svc('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: { display_name: 'iOS Probe', org_id: org.id },
  }),
})
if (userStatus >= 300) { console.error('Could not create probe user', user); process.exit(2) }

// Three requests so the pagination walk has something to page over.
const requestIds = []
for (let i = 1; i <= 3; i++) {
  const { body: [row] } = await svc('/rest/v1/prayer_requests?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ request: `iOS probe request ${i}`, source: 'web', org_id: org.id }),
  })
  requestIds.push(row.id)
}

// A row belonging to some other org, for the cross-org 404.
const { body: foreignRows } = await svc(
  `/rest/v1/prayer_requests?select=id&org_id=neq.${org.id}&limit=1`
)
const foreignId = foreignRows?.[0]?.id

const tokenRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
const token = (await tokenRes.json()).access_token
if (!token) { console.error('Could not sign in as probe user'); process.exit(2) }

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

// --- probes ---------------------------------------------------------------
console.log(`\nProbing ${BASE} with a Bearer token…`)

{
  const { status, body } = await api('/api/me')
  check(
    'GET /api/me returns identity + org',
    status === 200 && body?.org?.slug === org.slug && body?.org?.sms_enabled === false && body?.role === 'prayer',
    `status ${status}, body ${JSON.stringify(body).slice(0, 160)}`
  )
}

{
  const { status, body } = await api('/api/settings')
  check(
    'GET /api/settings returns prefs',
    status === 200 && typeof body?.notify_new_requests === 'boolean' && !!body?.notify_frequency,
    `status ${status}, body ${JSON.stringify(body).slice(0, 120)}`
  )
}

{
  const { status, body } = await api('/api/prayers')
  check(
    'GET /api/prayers (no limit) stays a bare array',
    status === 200 && Array.isArray(body) && body.length === 3,
    `status ${status}, ${Array.isArray(body) ? body.length + ' rows' : JSON.stringify(body).slice(0, 120)}`
  )
}

{
  const p1 = await api('/api/prayers?limit=2')
  const okShape =
    p1.status === 200 && Array.isArray(p1.body?.items) && p1.body.items.length === 2 && !!p1.body.next_cursor
  check('GET /api/prayers?limit=2 pages with a cursor', okShape,
    `status ${p1.status}, body ${JSON.stringify(p1.body).slice(0, 160)}`)
  if (okShape) {
    const p2 = await api(`/api/prayers?limit=2&cursor=${encodeURIComponent(p1.body.next_cursor)}`)
    const ids1 = p1.body.items.map(i => i.id)
    const ids2 = (p2.body?.items ?? []).map(i => i.id)
    check(
      'second page returns the remainder and ends',
      p2.status === 200 && ids2.length === 1 && !ids1.includes(ids2[0]) && p2.body.next_cursor === null,
      `status ${p2.status}, body ${JSON.stringify(p2.body).slice(0, 160)}`
    )
  }
}

{
  const { status, body } = await api(`/api/prayers/${requestIds[0]}`)
  check(
    'GET /api/prayers/[id] returns the request with you_prayed',
    status === 200 && body?.id === requestIds[0] && body?.you_prayed === false && !('phone' in (body ?? {})),
    `status ${status}, body ${JSON.stringify(body).slice(0, 160)}`
  )
}

if (foreignId) {
  const { status } = await api(`/api/prayers/${foreignId}`)
  check("GET /api/prayers/[id] is 404 for another church's request", status === 404, `status ${status}`)
} else {
  check("GET /api/prayers/[id] is 404 for another church's request", false, 'no foreign row found')
}

{
  const on = await api(`/api/prayers/${requestIds[0]}/pray`, { method: 'POST' })
  const off = await api(`/api/prayers/${requestIds[0]}/pray`, { method: 'DELETE' })
  check(
    'pray toggle works over Bearer',
    on.status === 200 && on.body?.you_prayed === true && on.body?.prayed_count === 1 &&
      off.status === 200 && off.body?.you_prayed === false,
    `on ${on.status} ${JSON.stringify(on.body)}, off ${off.status} ${JSON.stringify(off.body)}`
  )
}

{
  const { status, body } = await api(`/api/prayers/${requestIds[1]}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'archived' }),
  })
  const after = await api('/api/prayers?status=archived')
  check(
    'PATCH status works over Bearer',
    status === 200 && body?.success === true && Array.isArray(after.body) && after.body.length === 1,
    `status ${status}, archived rows ${Array.isArray(after.body) ? after.body.length : '?'}`
  )
}

{
  const { status, body } = await api('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ notify_frequency: 'weekly' }),
  })
  const readback = await api('/api/settings')
  check(
    'PATCH /api/settings works over Bearer',
    status === 200 && body?.success === true && readback.body?.notify_frequency === 'weekly',
    `status ${status}, readback ${JSON.stringify(readback.body).slice(0, 120)}`
  )
}

{
  const { status } = await api(`/api/prayers/${requestIds[0]}/respond`, {
    method: 'POST',
    body: JSON.stringify({ body: 'probe reply' }),
  })
  check(
    "respond refuses politely for an SMS-less church",
    status === 400,
    `status ${status}`
  )
}

{
  const res = await fetch(`${BASE}/api/me`)
  check('no token → 401', res.status === 401, `status ${res.status}`)
}

{
  const res = await fetch(`${BASE}/api/me`, { headers: { Authorization: 'Bearer not-a-real-token' } })
  check('garbage token → 401', res.status === 401, `status ${res.status}`)
}

// --- cleanup --------------------------------------------------------------
console.log('\nCleaning up fixtures…')
await svc(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
await svc(`/rest/v1/prayer_requests?org_id=eq.${org.id}`, { method: 'DELETE' })
await svc(`/rest/v1/message_log?org_id=eq.${org.id}`, { method: 'DELETE' })
await svc(`/rest/v1/organizations?id=eq.${org.id}`, { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
