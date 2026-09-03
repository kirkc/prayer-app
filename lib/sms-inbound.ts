import type { SupabaseClient } from '@supabase/supabase-js'

// Sorting an inbound text into "reply to us" vs "new request".
//
// SMS has no threading — Twilio can't tell us what a message is answering.
// What we do have: the sender's number, the church they texted, and a log of
// everything we've sent that number (message_log). A tapback is unmistakable
// from its text alone. A short message shortly after we texted someone is,
// nearly always, an answer. Everything else stays a request, same as before.

export type InboundKind = 'reaction' | 'candidate_reply' | 'request'

// How long after we text someone a short message still reads as a reply.
// Kirk picked 4 days; extend if reactions keep leaking into the feed.
export const REPLY_WINDOW_HOURS = 96

// Longer than this and it's probably a request, even from a recent contact.
// "Thank you so much" is 17 chars; a real follow-up request runs well past
// 120. Misfiles either way are one tap to fix on the card.
export const REPLY_MAX_LENGTH = 120

// iMessage tapbacks relayed as SMS. Apple's wording is fixed; the quotes are
// curly in practice but straight in some relays, so accept both.
//   Loved "Someone prayed for you today…"
//   Reacted 🙏 to "Someone prayed for you today…"
const TAPBACK = /^(?:Loved|Liked|Disliked|Laughed at|Emphasized|Questioned|Reacted .{1,8} to) [“"][\s\S]*[”"]$/u

export function isTapback(body: string): boolean {
  return TAPBACK.test(body.trim())
}

export function classifyInbound(body: string): InboundKind {
  const text = body.trim()
  if (isTapback(text)) return 'reaction'
  if (text.length <= REPLY_MAX_LENGTH) return 'candidate_reply'
  return 'request'
}

// The emoji a tapback stands for, so the thread can show ❤️ instead of
// `Loved "Someone prayed for you today…"`. Unknown shapes fall back to a heart.
export function reactionGlyph(body: string): string {
  const text = body.trim()
  if (text.startsWith('Loved')) return '❤️'
  if (text.startsWith('Liked')) return '👍'
  if (text.startsWith('Disliked')) return '👎'
  if (text.startsWith('Laughed at')) return '😂'
  if (text.startsWith('Emphasized')) return '‼️'
  if (text.startsWith('Questioned')) return '❓'
  const m = text.match(/^Reacted (.{1,8}) to /u)
  return m ? m[1] : '❤️'
}

export type RecentOutbound = {
  request_id: string | null
  // The team member who sent it, when it was a reply from the dashboard.
  profile_id: string | null
  created_at: string
}

// The most recent text we sent this number from this church, optionally only
// if it went out within the last N hours. message_log.meta carries request_id
// for replies, prayer updates, and (from now on) the ack.
export async function findRecentOutbound(
  supabase: SupabaseClient,
  opts: { orgId: string; phone: string; withinHours?: number }
): Promise<RecentOutbound | null> {
  let query = supabase
    .from('message_log')
    .select('created_at, meta')
    .eq('channel', 'sms')
    .eq('org_id', opts.orgId)
    .eq('recipient', opts.phone)
    // A text that never reached them can't be what they're answering.
    .not('status', 'in', '("failed","undelivered")')
    .order('created_at', { ascending: false })
    .limit(1)
  if (opts.withinHours != null) {
    const since = new Date(Date.now() - opts.withinHours * 3600 * 1000).toISOString()
    query = query.gte('created_at', since)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data) return null
  const meta = (data.meta ?? {}) as Record<string, unknown>
  return {
    request_id: typeof meta.request_id === 'string' ? meta.request_id : null,
    profile_id: typeof meta.profile_id === 'string' ? meta.profile_id : null,
    created_at: data.created_at as string,
  }
}

// This number's latest request at this church. `activeOnly` for replies (an
// archived request shouldn't quietly collect new replies); any status for
// reactions, which have nowhere else to go.
export async function findRequestForPhone(
  supabase: SupabaseClient,
  opts: { orgId: string; phone: string; activeOnly: boolean; before?: string }
): Promise<string | null> {
  let query = supabase
    .from('prayer_requests')
    .select('id')
    .eq('org_id', opts.orgId)
    .eq('phone', opts.phone)
    .order('created_at', { ascending: false })
    .limit(1)
  if (opts.activeOnly) query = query.eq('status', 'active')
  // When re-filing a misclassified request as a reply, the thing it answers
  // has to be older than it.
  if (opts.before) query = query.lt('created_at', opts.before)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data?.id as string | undefined) ?? null
}

// Which request an inbound text belongs to. The last outbound's request wins
// when it named one — that's the message they're literally answering — and
// the number's latest request is the fallback.
export async function resolveReplyTarget(
  supabase: SupabaseClient,
  opts: { orgId: string; phone: string; outbound: RecentOutbound | null; activeOnly: boolean }
): Promise<string | null> {
  if (opts.outbound?.request_id) {
    // Confirm it still exists (REMOVE or Delete may have taken it).
    const { data } = await supabase
      .from('prayer_requests')
      .select('id')
      .eq('id', opts.outbound.request_id)
      .eq('org_id', opts.orgId)
      .maybeSingle()
    if (data?.id) return data.id as string
  }
  return findRequestForPhone(supabase, {
    orgId: opts.orgId,
    phone: opts.phone,
    activeOnly: opts.activeOnly,
  })
}
