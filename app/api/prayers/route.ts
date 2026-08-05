import { NextRequest, NextResponse } from 'next/server'
import { createApiContext, createServiceClient } from '@/lib/supabase-server'
import { getPrayerFeed, getPrayerFeedPage } from '@/lib/prayers'
import { getOrgBySlug, DEFAULT_ORG_SLUG } from '@/lib/orgs'
import { submitPrayer, preflightResponse } from '@/lib/prayer-submit'
import type { PrayerRequest } from '@/types'

const STATUSES: PrayerRequest['status'][] = ['active', 'archived', 'spam']

// POST/OPTIONS here are the legacy public-form endpoints, pinned to the
// default org — the home page and the kirkcastro.com case-study embed post
// here with no slug. Cross-origin allowlisting comes from the org row
// (Redemption's includes kirkcastro.com). Per-church submissions use
// /api/orgs/[slug]/prayers; only GET (the team feed) is unique to this file.

export async function OPTIONS(req: NextRequest) {
  const org = await getOrgBySlug(createServiceClient(), DEFAULT_ORG_SLUG).catch(() => null)
  return preflightResponse(req, org)
}

// GET /api/prayers?status=active|archived|spam&q=searchterm
// With ?limit=N (and optional ?cursor=) the response becomes a page —
// { items, next_cursor } — for the iOS app; without it, the bare array the
// web dashboard has always consumed. Auth: session cookie or Bearer token.
export async function GET(req: NextRequest) {
  const { supabase, user } = await createApiContext(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const statusParam = req.nextUrl.searchParams.get('status') ?? 'active'
  const status = STATUSES.includes(statusParam as PrayerRequest['status'])
    ? (statusParam as PrayerRequest['status'])
    : 'active'
  const search = req.nextUrl.searchParams.get('q') ?? undefined

  const limitParam = req.nextUrl.searchParams.get('limit')
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 100) : null

  try {
    if (limit !== null) {
      const cursor = req.nextUrl.searchParams.get('cursor') ?? undefined
      const page = await getPrayerFeedPage(supabase, user.id, { status, search, limit, cursor })
      return NextResponse.json(page)
    }
    const feed = await getPrayerFeed(supabase, user.id, { status, search })
    return NextResponse.json(feed)
  } catch {
    return NextResponse.json({ error: 'Could not load prayer requests.' }, { status: 500 })
  }
}

// POST /api/prayers — public web-form submission (unauthenticated).
export async function POST(req: NextRequest) {
  let org
  try {
    org = await getOrgBySlug(createServiceClient(), DEFAULT_ORG_SLUG)
  } catch {
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }
  if (!org) {
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }
  return submitPrayer(req, org)
}
