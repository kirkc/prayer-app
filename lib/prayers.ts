import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrayerRequest, PrayerRequestWithState } from '@/types'

// The only columns ever sent to the browser. `phone` is deliberately excluded;
// the database also enforces this via column-level grants (migration 002).
// `has_phone` (migration 011) exposes only its presence so the UI knows a
// text reply is possible.
export const PRAYER_COLUMNS =
  'id, name, request, source, status, replied, prayed_count, created_at, has_phone'

type Status = PrayerRequest['status']

// Loads a status-filtered feed and annotates each request with whether the
// current user has already prayed for it. Used by the dashboard and the
// /api/prayers feed endpoint so both stay consistent.
export async function getPrayerFeed(
  supabase: SupabaseClient,
  userId: string,
  { status = 'active', search }: { status?: Status; search?: string } = {}
): Promise<PrayerRequestWithState[]> {
  let query = supabase
    .from('prayer_requests')
    .select(PRAYER_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (search?.trim()) {
    const term = `%${search.trim()}%`
    query = query.or(`request.ilike.${term},name.ilike.${term}`)
  }

  const { data: requests, error } = await query
  if (error) throw error

  const list = (requests ?? []) as PrayerRequest[]
  if (list.length === 0) return []

  // Which of these requests has the current user already prayed for?
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
