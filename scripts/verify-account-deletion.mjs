#!/usr/bin/env node
// Verification for DELETE /api/me — the self-service account deletion the App
// Store expects to find inside the app.
//
// Creates a throwaway org and members, walks one account through every guard,
// then lets the real endpoint delete it and checks what cascaded. Cleans up
// after itself. Never touches Redemption or test-church.
//
//   BASE_URL=http://localhost:3005 node scripts/verify-account-deletion.mjs
//
// Reads Supabase env from .env.local like the other verify scripts. Needs the
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

const setRole = (id, role) =>
  svc(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })

// --- fixtures -------------------------------------------------------------
const STAMP = randomUUID().slice(0, 8)
console.log('Setting up fixtures…')

const { body: [org] } = await svc('/rest/v1/organizations?select=id,slug', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ slug: `del-probe-${STAMP}`, name: 'Deletion Probe Org' }),
})

async function makeMember(label, withPassword) {
  const email = `del-probe-${label}-${STAMP}@example.com`
  const password = withPassword ? `Probe-${randomUUID()}` : undefined
  const { status, body } = await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      ...(password ? { password } : {}),
      email_confirm: true,
      app_metadata: { invited: true },
      user_metadata: { display_name: `Deletion Probe ${label}`, org_id: org.id },
    }),
  })
  if (status >= 300) { console.error(`Could not create probe user ${label}`, body); process.exit(2) }
  return { id: body.id, email, password }
}

const subject = await makeMember('subject', true)
const peer = await makeMember('peer', false)

// A device token, so we can prove the claim the privacy policy makes: it goes
// away with the account.
await svc('/rest/v1/device_tokens', {
  method: 'POST',
  body: JSON.stringify({
    token: randomUUID().replace(/-/g, '').repeat(2),
    profile_id: subject.id,
    environment: 'sandbox',
  }),
})

async function token() {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: subject.email, password: subject.password }),
  })
  return (await res.json()).access_token
}

async function callDelete(headers = null) {
  const auth = headers ?? { Authorization: `Bearer ${await token()}` }
  const res = await fetch(`${BASE}/api/me`, { method: 'DELETE', headers: auth })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

// --- probes ---------------------------------------------------------------
console.log(`\nProbing ${BASE}…`)

const { body: [profile] } = await svc(`/rest/v1/profiles?select=org_id,role&id=eq.${subject.id}`)
check('probe lands in its own org', profile?.org_id === org.id, `org_id=${profile?.org_id}`)

let r = await callDelete({})
check('unauthenticated is rejected', r.status === 401, `got ${r.status}`)

await setRole(subject.id, 'super_admin')
r = await callDelete()
check('super admin is refused', r.status === 400, `got ${r.status} ${r.body?.error ?? ''}`)

await setRole(subject.id, 'admin')
r = await callDelete()
check("a church's only admin is refused", r.status === 400, `got ${r.status} ${r.body?.error ?? ''}`)
check(
  'the refusal explains the way out',
  /administrator/i.test(r.body?.error ?? ''),
  r.body?.error ?? ''
)

// Still there after being refused twice.
const { body: survived } = await svc(`/rest/v1/profiles?select=id&id=eq.${subject.id}`)
check('a refused account is untouched', survived?.length === 1)

await setRole(peer.id, 'admin')
r = await callDelete()
check('an admin with a peer may leave', r.status === 200, `got ${r.status} ${r.body?.error ?? ''}`)

const { status: goneStatus } = await svc(`/auth/v1/admin/users/${subject.id}`)
check('the auth user is gone', goneStatus === 404, `got ${goneStatus}`)

const { body: profileAfter } = await svc(`/rest/v1/profiles?select=id&id=eq.${subject.id}`)
check('the profile cascaded away', profileAfter?.length === 0)

const { body: tokensAfter } = await svc(
  `/rest/v1/device_tokens?select=id&profile_id=eq.${subject.id}`
)
check('their device tokens cascaded away', tokensAfter?.length === 0)

// --- cleanup --------------------------------------------------------------
await svc(`/auth/v1/admin/users/${peer.id}`, { method: 'DELETE' })
await svc(`/rest/v1/organizations?id=eq.${org.id}`, { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
