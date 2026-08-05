import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrayerRequest, PrayerRequestWithState } from '@/types'

// The only columns ever sent to the browser. `phone` is deliberately excluded;
// the database also enforces this via column-level grants (migration 002).
// `has_phone` (migration 011) exposes only its presence so the UI knows a
// text reply is possible.
export const PRAYER_COLUMNS =
  'id, name, request, source, status, replied, prayed_count, created_at, has_phone'

type Status = PrayerRequest['status']
type FeedFilters = { status?: Status; search?: string }

// A page of the feed plus the cursor for the next one — the shape the iOS
// app consumes. The web dashboard still uses the unpaginated getPrayerFeed.
export type FeedPage = {
  items: PrayerRequestWithState[]
  next_cursor: string | null
}

// Keyset cursor over (created_at desc, id desc) — stable under inserts,
// unlike offsets. Opaque to clients.
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString('base64url')
}

export function decodeCursor(
  cursor: string
): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString()
    const split = raw.indexOf('|')
    if (split <= 0) return null
    return { createdAt: raw.slice(0, split), id: raw.slice(split + 1) }
  } catch {
    return null
  }
}

function buildFeedQuery(
  supabase: SupabaseClient,
  { status = 'active', search }: FeedFilters
) {
  let query = supabase
    .from('prayer_requests')
    .select(PRAYER_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`request.ilike.${term},name.ilike.${term}`)
  }
  return query
}

// Which of these requests has the current user already prayed for?
async function annotateYouPrayed(
  supabase: SupabaseClient,
  userId: string,
  list: PrayerRequest[]
): Promise<PrayerRequestWithState[]> {
  if (list.length === 0) return []
  const { data: mine } = await supabase
    .from('prayers')
    .select('request_id')
    .eq('profile_id', userId)
    .in(
      'request_id',
      list.map(r => r.id)
    )
  const prayedSet = new Set((mine ?? []).map(m => m.request_id as string))
  return list.map(r => ({ ...r, you_prayed: prayedSet.has(r.id) }))
}

// Loads a status-filtered feed and annotates each request with whether the
// current user has already prayed for it. Used by the dashboard and the
// /api/prayers feed endpoint so both stay consistent.
export async function getPrayerFeed(
  supabase: SupabaseClient,
  userId: string,
  filters: FeedFilters = {}
): Promise<PrayerRequestWithState[]> {
  const { data: requests, error } = await buildFeedQuery(supabase, filters)
  if (error) throw error
  return annotateYouPrayed(supabase, userId, (requests ?? []) as PrayerRequest[])
}

// One page of the feed. Fetches limit+1 rows to know whether a next page
// exists without a second round trip.
export async function getPrayerFeedPage(
  supabase: SupabaseClient,
  userId: string,
  {
    limit,
    cursor,
    ...filters
  }: FeedFilters & { limit: number; cursor?: string }
): Promise<FeedPage> {
  let query = buildFeedQuery(supabase, filters)

  if (cursor) {
    const decoded = decodeCursor(cursor)
    if (decoded) {
      query = query.or(
        `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`
      )
    }
  }

  const { data: requests, error } = await query.limit(limit + 1)
  if (error) throw error

  const rows = (requests ?? []) as PrayerRequest[]
  const pageRows = rows.slice(0, limit)
  const items = await annotateYouPrayed(supabase, userId, pageRows)
  const last = pageRows[pageRows.length - 1]
  return {
    items,
    next_cursor:
      rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  }
}
