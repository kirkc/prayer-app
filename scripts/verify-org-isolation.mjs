#!/usr/bin/env node
// Org-isolation probe suite for migration 013 (org-scoped RLS).
//
// Creates a throwaway org + member, then hits PostgREST directly — the way an
// attacker with the anon key or a hostile signed-in member would — and asserts
// every cross-tenant and privacy boundary holds. Cleans up after itself.
//
//   node scripts/verify-org-isolation.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY from .env.local (or the environment).
// Exits non-zero if any probe fails. Run AFTER migration 013.

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

// --- env ------------------------------------------------------------------
function loadEnv() {
  const out = { ...process.env }
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m && !out[m[1]]) out[m[1]] = m[2]
    }
  } catch { /* .env.local optional when env vars are set */ }
  return out
}
const env = loadEnv()
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !ANON || !SERVICE) {
  console.error('Missing Supabase env (URL / anon key / service key)')
  process.exit(2)
}

const svcHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}

async function svc(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { ...svcHeaders, ...init.headers } })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

// --- probe bookkeeping ----------------------------------------------------
let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// --- setup: throwaway org, member, and one request ------------------------
const STAMP = randomUUID().slice(0, 8)
const PROBE_EMAIL = `probe-${STAMP}@example.com`
const PROBE_PASSWORD = `Probe-${randomUUID()}`

console.log('Setting up probe fixtures…')

const { body: [probeOrg] } = await svc('/rest/v1/organizations?select=id,slug', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ slug: `probe-${STAMP}`, name: 'Probe Org (safe to delete)' }),
})

// app_metadata.invited mirrors the app's invite flow — after migration 013
// the profile trigger rejects any auth user created without it.
const { status: userStatus, body: probeUser } = await svc('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email: PROBE_EMAIL,
    password: PROBE_PASSWORD,
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: { display_name: 'Probe', org_id: probeOrg.id },
  }),
})
if (userStatus >= 300) { console.error('Could not create probe user', probeUser); process.exit(2) }

const { body: [probeRequest] } = await svc('/rest/v1/prayer_requests?select=id', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ request: 'probe request (safe to delete)', source: 'web', org_id: probeOrg.id }),
})

// A real Redemption row id, to probe against (never modified by the probes —
// the whole point is that writes against it fail).
const { body: redemptionRows } = await svc(
  "/rest/v1/prayer_requests?select=id,org_id&org_id=neq." + probeOrg.id + '&limit=1'
)
const targetRow = redemptionRows?.[0]

// Sign in as the probe member.
const tokenRes = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
})
const token = (await tokenRes.json()).access_token
if (!token) { console.error('Could not sign in as probe user'); process.exit(2) }

async function asMember(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: ANON,
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

async function asAnon(path, init = {}) {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...init.headers },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

// --- probes ---------------------------------------------------------------
console.log('\nProbing as a signed-in member of the probe org…')

{
  const { status, body } = await asMember('/rest/v1/prayer_requests?select=id')
  check(
    'feed returns only own-org rows',
    status === 200 && Array.isArray(body) && body.length === 1 && body[0].id === probeRequest.id,
    `status ${status}, rows ${Array.isArray(body) ? body.length : JSON.stringify(body)}`
  )
}

if (targetRow) {
  const { status, body } = await asMember(`/rest/v1/prayer_requests?select=id&org_id=eq.${targetRow.org_id}`)
  check(
    'filtering by another org id returns nothing',
    status === 200 && Array.isArray(body) && body.length === 0,
    `status ${status}, rows ${Array.isArray(body) ? body.length : JSON.stringify(body)}`
  )
} else {
  check('filtering by another org id returns nothing', false, 'no non-probe row found to target')
}

{
  const { status } = await asMember('/rest/v1/prayer_requests?select=phone')
  check('selecting phone is a column-permission error', status === 403 || status === 401, `status ${status}`)
}

{
  const { status } = await asMember('/rest/v1/prayer_requests?select=*')
  check('select * fails (phone grant absent)', status === 403 || status === 401, `status ${status}`)
}

if (targetRow) {
  const { status, body } = await asMember(
    `/rest/v1/prayer_requests?id=eq.${targetRow.id}`,
    { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'archived' }) }
  )
  check(
    "updating another org's row hits zero rows",
    status === 200 && Array.isArray(body) && body.length === 0,
    `status ${status}, body ${JSON.stringify(body).slice(0, 120)}`
  )
}

{
  const { status } = await asMember(
    `/rest/v1/prayer_requests?id=eq.${probeRequest.id}`,
    { method: 'PATCH', body: JSON.stringify({ phone: '+15555550100' }) }
  )
  check('setting phone is denied even on own-org rows', status === 403 || status === 401, `status ${status}`)
}

{
  const { status, body } = await asMember('/rest/v1/profiles?select=id')
  check(
    'roster shows only own org (just the probe user)',
    status === 200 && Array.isArray(body) && body.length === 1 && body[0].id === probeUser.id,
    `status ${status}, rows ${Array.isArray(body) ? body.length : JSON.stringify(body)}`
  )
}

if (targetRow) {
  const { status } = await asMember('/rest/v1/prayers', {
    method: 'POST',
    body: JSON.stringify({ request_id: targetRow.id, profile_id: probeUser.id }),
  })
  check("praying for another org's request violates WITH CHECK", status === 403 || status === 401, `status ${status}`)
}

{
  const { status } = await asMember('/rest/v1/prayer_responses?select=id')
  check('prayer_responses is service-role only', status === 403 || status === 401, `status ${status}`)
}

console.log('\nProbing with the bare anon key…')

for (const table of ['prayer_requests', 'profiles', 'prayers', 'prayer_responses', 'organizations']) {
  const { status, body } = await asAnon(`/rest/v1/${table}?select=id&limit=1`)
  // Denied (permission) or empty (RLS) both mean no data escapes; a row is a failure.
  const leaked = status === 200 && Array.isArray(body) && body.length > 0
  check(`anon cannot read ${table}`, !leaked, `status ${status}, body ${JSON.stringify(body).slice(0, 120)}`)
}

{
  const { status } = await asAnon('/rest/v1/rpc/admin_dashboard_stats', { method: 'POST', body: '{}' })
  check('anon cannot call admin_dashboard_stats()', status !== 200, `status ${status}`)
}

{
  // Even with a valid org id in the client-settable metadata, self-signup
  // must fail: the profile trigger requires the app_metadata invite marker,
  // which only the service role can set.
  const { status, body } = await asAnon('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: `selfsignup-${STAMP}@example.com`,
      password: PROBE_PASSWORD,
      data: { org_id: probeOrg.id },
    }),
  })
  const createdId = status < 300 ? (body?.id ?? body?.user?.id) : null
  check('public self-signup is rejected', !createdId, `status ${status}`)
  if (createdId) await svc(`/auth/v1/admin/users/${createdId}`, { method: 'DELETE' })
}

// --- sanity: the app's own read path still works for the probe member -----
{
  const { status, body } = await asMember(
    '/rest/v1/prayer_requests?select=id,name,request,source,status,replied,prayed_count,created_at,has_phone'
  )
  check(
    'the PRAYER_COLUMNS projection still works for members',
    status === 200 && Array.isArray(body) && body.length === 1,
    `status ${status}`
  )
}

// --- cleanup --------------------------------------------------------------
console.log('\nCleaning up probe fixtures…')
await svc(`/auth/v1/admin/users/${probeUser.id}`, { method: 'DELETE' })
await svc(`/rest/v1/prayer_requests?org_id=eq.${probeOrg.id}`, { method: 'DELETE' })
await svc(`/rest/v1/message_log?org_id=eq.${probeOrg.id}`, { method: 'DELETE' })
await svc(`/rest/v1/organizations?id=eq.${probeOrg.id}`, { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
