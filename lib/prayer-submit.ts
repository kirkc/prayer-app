import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { notifyNewRequest } from '@/lib/notifications'
import { normalizePhone } from '@/lib/phone'
import { logError } from '@/lib/log'
import type { Org } from '@/lib/orgs'

// The public prayer-submission handler, shared by the legacy /api/prayers
// POST (pinned to the default org — the kirkcastro.com embed and the home
// page post there) and the per-church /api/orgs/[slug]/prayers route.

// A church's own sites may embed its form cross-origin: the allowlist lives
// on the organizations row. localhost stays open as the dev escape hatch.
export function orgCorsHeaders(
  req: NextRequest,
  org: Pick<Org, 'allowed_origins'> | null
): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed =
    (org?.allowed_origins ?? []).includes(origin) ||
    origin.startsWith('http://localhost:')
  return allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

export function preflightResponse(req: NextRequest, org: Pick<Org, 'allowed_origins'> | null) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...orgCorsHeaders(req, org),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function submitPrayer(req: NextRequest, org: Org): Promise<NextResponse> {
  const cors = orgCorsHeaders(req, org)
  const json = (data: unknown, status: number) =>
    NextResponse.json(data, { status, headers: cors })

  if (!rateLimit(`web-form:${org.slug}:${clientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
    return json({ error: 'Too many requests. Please try again in a moment.' }, 429)
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return json({ error: 'Invalid request.' }, 400)
  }

  // Honeypot: real users never fill a hidden field. Pretend success for bots.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ success: true }, 201)
  }

  const request = typeof body.request === 'string' ? body.request.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!request) {
    return json({ error: 'Prayer request is required.' }, 400)
  }
  if (request.length > 2000) {
    return json({ error: 'Prayer request is too long.' }, 400)
  }

  // Optional: the requester can opt into "someone prayed for you" texts by
  // giving a phone number and checking consent. Only store the number when
  // both are present, it's a valid US number we can actually text, AND this
  // church has texting set up — a church without a Twilio number can never
  // send updates, so storing the number would be collecting data we can't
  // act on.
  let phone: string | null = null
  if (
    org.twilio_phone !== null &&
    body.notify_prayers === true &&
    typeof body.phone === 'string' &&
    body.phone.trim()
  ) {
    phone = normalizePhone(body.phone)
    if (!phone) {
      return json({ error: 'Please enter a valid US phone number.' }, 400)
    }
  }

  // Use the service role: the public form has no session, and we don't return
  // the stored row to the browser, so nothing sensitive is exposed. The id
  // comes back only so the team's push notifications can deep-link.
  const supabase = createServiceClient()
  const { data: inserted, error } = await supabase
    .from('prayer_requests')
    .insert({
      name: name || null,
      request,
      source: 'web',
      phone,
      notify_prayers: phone !== null,
      org_id: org.id,
    })
    .select('id')
    .single()

  if (error) {
    await logError('prayers.web_insert', error, { org_id: org.id })
    return json({ error: 'Could not save your request.' }, 500)
  }

  // Alert immediate-cadence team members after the response is sent, so the
  // submitter isn't kept waiting on email fan-out.
  after(() =>
    notifyNewRequest({ id: inserted?.id, name: name || null, request, source: 'web' }, org)
  )

  return json({ success: true }, 201)
}
