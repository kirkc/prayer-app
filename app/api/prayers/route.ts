import { NextRequest, NextResponse, after } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { getPrayerFeed } from '@/lib/prayers'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { notifyNewRequest } from '@/lib/notifications'
import type { PrayerRequest } from '@/types'

const STATUSES: PrayerRequest['status'][] = ['active', 'archived', 'spam']

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
  if (!rateLimit(`web-form:${clientIp(req)}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot: real users never fill a hidden field. Pretend success for bots.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ success: true }, { status: 201 })
  }

  const request = typeof body.request === 'string' ? body.request.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  if (!request) {
    return NextResponse.json({ error: 'Prayer request is required.' }, { status: 400 })
  }
  if (request.length > 2000) {
    return NextResponse.json({ error: 'Prayer request is too long.' }, { status: 400 })
  }

  // Use the service role: the public form has no session, and we don't return
  // the stored row to the browser, so nothing sensitive is exposed.
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('prayer_requests')
    .insert({ name: name || null, request, source: 'web' })

  if (error) {
    console.error('Web-form insert error:', error)
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }

  // Alert immediate-cadence team members after the response is sent, so the
  // submitter isn't kept waiting on email fan-out.
  after(() => notifyNewRequest({ name: name || null, request, source: 'web' }))

  return NextResponse.json({ success: true }, { status: 201 })
}
