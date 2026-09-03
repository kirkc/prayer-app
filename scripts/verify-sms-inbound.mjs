#!/usr/bin/env node
// Inbound-SMS classification probe (replies and reactions, migration 017).
//
// Creates a throwaway org with a Twilio number, posts fake Twilio webhook
// bodies to /api/sms, and checks that tapbacks and short replies land in
// inbound_messages instead of prayer_requests — and that everything else
// still becomes a request. Also round-trips the reclassify/promote routes
// and the REMOVE keyword. Cleans up after itself.
//
//   BASE_URL=http://localhost:3005 node scripts/verify-sms-inbound.mjs
//
// Needs the Next.js server running at BASE_URL with NODE_ENV != production
// (so the Twilio signature check is advisory) and TWILIO_AUTH_TOKEN set to
// anything (validateRequest needs a string). Outbound sends will fail without
// real Twilio creds; that's fine — the probe seeds message_log itself.

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
const DIGITS = String(Math.floor(Math.random() * 1e7)).padStart(7, '0')
const CHURCH_PHONE = `+15550${DIGITS.slice(1)}`
const REQUESTER = `+15551${DIGITS.slice(1)}`
console.log('Setting up fixtures…')

const { body: [org] } = await svc('/rest/v1/organizations?select=id,slug', {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify({ slug: `sms-probe-${STAMP}`, name: 'SMS Probe Org', twilio_phone: CHURCH_PHONE }),
})

const email = `sms-probe-${STAMP}@example.com`
const password = `Probe-${randomUUID()}`
const { status: userStatus, body: user } = await svc('/auth/v1/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: { display_name: 'SMS Probe', org_id: org.id },
  }),
})
if (userStatus >= 300) { console.error('Could not create probe user', user); process.exit(2) }

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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

// A fake Twilio delivery. Signature is wrong on purpose; outside production
// the route logs and continues.
let sidCounter = 0
async function inbound(bodyText) {
  const form = new URLSearchParams({
    From: REQUESTER,
    To: CHURCH_PHONE,
    Body: bodyText,
    SmsMessageSid: `SMprobe${STAMP}${++sidCounter}`,
  })
  const res = await fetch(`${BASE}/api/sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  return res.status
}

const requests = () => svc(`/rest/v1/prayer_requests?select=id,request,reply_count,created_at&org_id=eq.${org.id}&order=created_at.asc`)
const inboundRows = () => svc(`/rest/v1/inbound_messages?select=id,request_id,kind,body&org_id=eq.${org.id}&order=received_at.asc`)

// Pretend we texted the requester about a request, from this member.
async function seedOutbound(requestId, { hoursAgo = 1, profileId = user.id, kind = 'sms.reply' } = {}) {
  const created = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString()
  await svc('/rest/v1/message_log', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'sms', kind, recipient: REQUESTER, status: 'delivered', org_id: org.id,
      created_at: created, meta: { request_id: requestId, profile_id: profileId },
    }),
  })
}

// --- probes ---------------------------------------------------------------
console.log(`\nProbing ${BASE}…`)

let firstId
{
  const status = await inbound("Please pray for my mother's surgery on Tuesday.")
  const { body } = await requests()
  firstId = body?.[0]?.id
  check('a plain text becomes a request', status === 200 && body?.length === 1, `status ${status}, ${body?.length} rows`)
}

{
  // Nobody has texted them yet: a short message is still a request.
  await inbound('Thank you')
  const { body } = await requests()
  check('a short text with no outbound in the window is a request', body?.length === 2, `${body?.length} rows`)
  // Put it back to one request so the rest of the probe has a single thread.
  await svc(`/rest/v1/prayer_requests?id=eq.${body[1].id}`, { method: 'DELETE' })
}

await seedOutbound(firstId)

{
  const status = await inbound('Loved “Someone prayed for you today. Grace and peace to you.”')
  const { body: rows } = await inboundRows()
  const { body: reqs } = await requests()
  check(
    'a tapback files as a reaction, not a request',
    status === 200 && rows?.length === 1 && rows[0].kind === 'reaction' && rows[0].request_id === firstId && reqs?.length === 1,
    `status ${status}, inbound ${JSON.stringify(rows)}, requests ${reqs?.length}`
  )
}

{
  await inbound('Thank you so much')
  const { body: rows } = await inboundRows()
  const { body: reqs } = await requests()
  check(
    'a short text inside the window files as a reply',
    rows?.length === 2 && rows[1].kind === 'reply' && reqs?.length === 1 && reqs[0].reply_count === 1,
    `inbound ${rows?.length}, requests ${reqs?.length}, reply_count ${reqs?.[0]?.reply_count}`
  )
}

{
  const { body: acks } = await svc(`/rest/v1/message_log?select=kind&org_id=eq.${org.id}&kind=eq.sms.ack`)
  // The first request's ack attempt is logged (as failed, no Twilio creds);
  // replies and reactions must not add any.
  check('replies and reactions get no ack', (acks?.length ?? 0) <= 1, `${acks?.length} ack rows`)
}

{
  const status = await inbound(
    'Update on my mom: the surgery went well but recovery is slow and she is discouraged. Please keep praying for her strength and for the doctors this week.'
  )
  const { body: reqs } = await requests()
  check('a long text inside the window is still a request', status === 200 && reqs?.length === 2, `${reqs?.length} rows`)
}

{
  // Age the outbound past the window: a short text becomes a request again.
  await svc(`/rest/v1/message_log?org_id=eq.${org.id}&kind=eq.sms.reply`, {
    method: 'PATCH',
    body: JSON.stringify({ created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }),
  })
  // The second request's ack also logged (failed) — those are excluded by status.
  await inbound('Thanks again')
  const { body: reqs } = await requests()
  check('a short text after the window is a request', reqs?.length === 3, `${reqs?.length} rows`)
}

let thirdId
{
  const { body: reqs } = await requests()
  thirdId = reqs[2].id
  const { status, body } = await api(`/api/prayers/${thirdId}/reclassify`, {
    method: 'POST', body: JSON.stringify({ to: 'thread' }),
  })
  const { body: after } = await requests()
  const { body: rows } = await inboundRows()
  check(
    'reclassify moves a request into the previous request’s thread',
    status === 200 && body?.target_id === reqs[1].id && after?.length === 2 && rows?.some(r => r.body === 'Thanks again' && r.request_id === reqs[1].id),
    `status ${status}, body ${JSON.stringify(body)}, requests ${after?.length}`
  )
}

{
  const { status, body } = await api(`/api/prayers/${firstId}/thread`)
  const kinds = (body?.items ?? []).map(i => `${i.direction}:${i.kind}`)
  check(
    'GET thread returns the conversation in order',
    status === 200 && kinds.join(',') === 'in:reaction,in:reply',
    `status ${status}, ${kinds.join(',')}`
  )
}

{
  const { body: rows } = await inboundRows()
  const reply = rows.find(r => r.body === 'Thank you so much')
  const { status, body } = await api(`/api/inbound/${reply.id}/promote`, { method: 'POST' })
  const { body: reqs } = await requests()
  const first = reqs.find(r => r.id === firstId)
  check(
    'promote turns a reply back into a request',
    status === 200 && !!body?.request_id && reqs?.length === 3 && first?.reply_count === 0,
    `status ${status}, requests ${reqs?.length}, reply_count ${first?.reply_count}`
  )
}

{
  const { status } = await api(`/api/prayers/${firstId}/reclassify`, {
    method: 'POST', body: JSON.stringify({ to: 'thread' }),
  })
  check('reclassify refuses when there is no earlier request', status === 400, `status ${status}`)
}

{
  await inbound('REMOVE')
  const { body: reqs } = await requests()
  const { body: rows } = await inboundRows()
  check('REMOVE still deletes the requests and their threads', reqs?.length === 0 && rows?.length === 0, `requests ${reqs?.length}, inbound ${rows?.length}`)
}

// --- cleanup --------------------------------------------------------------
console.log('\nCleaning up fixtures…')
await svc(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE' })
await svc(`/rest/v1/inbound_messages?org_id=eq.${org.id}`, { method: 'DELETE' })
await svc(`/rest/v1/prayer_requests?org_id=eq.${org.id}`, { method: 'DELETE' })
await svc(`/rest/v1/message_log?org_id=eq.${org.id}`, { method: 'DELETE' })
await svc(`/rest/v1/organizations?id=eq.${org.id}`, { method: 'DELETE' })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
