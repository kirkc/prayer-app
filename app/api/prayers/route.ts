import { NextRequest, NextResponse, after } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { getPrayerFeed } from '@/lib/prayers'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { notifyNewRequest } from '@/lib/notifications'
import { normalizePhone } from '@/lib/phone'
import type { PrayerRequest } from '@/types'

const STATUSES: PrayerRequest['status'][] = ['active', 'archived', 'spam']

// The public form is also embedded in the kirkcastro.com case study, which
// posts here cross-origin. Only POST is opened up; GET stays same-origin.
const CORS_ORIGINS = new Set(['https://kirkcastro.com', 'https://www.kirkcastro.com'])

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = CORS_ORIGINS.has(origin) || origin.startsWith('http://localhost:')
  return allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

export function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

// GET /api/prayers?status=active|archived|spam&q=searchterm
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statusParam = req.nextUrl.searchParams.get('status') ?? 'active'
  const status = STATUSES.includes(statusParam as PrayerRequest['status'])
    ? (statusParam as PrayerRequest['status'])
    : 'active'
  const search = req.nextUrl.searchParams.get('q') ?? undefined

  try {
    const feed = await getPrayerFeed(supabase, user.id, { status, search })
    return NextResponse.json(feed)
  } catch {
    return NextResponse.json({ error: 'Could not load prayer requests.' }, { status: 500 })
  }
}

// POST /api/prayers — public web-form submission (unauthenticated).
export async function POST(req: NextRequest) {
  const cors = corsHeaders(req)
  const json = (data: unknown, status: number) =>
    NextResponse.json(data, { status, headers: cors })

  if (!rateLimit(`web-form:${clientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
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
  // giving a phone number and checking consent. Only store the number when both
  // are present, and only if it's a valid US number we can actually text.
  let phone: string | null = null
  if (body.notify_prayers === true && typeof body.phone === 'string' && body.phone.trim()) {
    phone = normalizePhone(body.phone)
    if (!phone) {
      return json({ error: 'Please enter a valid US phone number.' }, 400)
    }
  }

  // Use the service role: the public form has no session, and we don't return
  // the stored row to the browser, so nothing sensitive is exposed.
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('prayer_requests')
    .insert({
      name: name || null,
      request,
      source: 'web',
      phone,
      notify_prayers: phone !== null,
    })

  if (error) {
    console.error('Web-form insert error:', error)
    return json({ error: 'Could not save your request.' }, 500)
  }

  // Alert immediate-cadence team members after the response is sent, so the
  // submitter isn't kept waiting on email fan-out.
  after(() => notifyNewRequest({ name: name || null, request, source: 'web' }))

  return json({ success: true }, 201)
}
