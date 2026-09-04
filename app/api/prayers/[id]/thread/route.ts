import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getApiMemberContext } from '@/lib/admin'
import {
  describeReactionTarget,
  quoteMatches,
  reactionGlyph,
  tapbackQuote,
} from '@/lib/sms-inbound'
import type { Thread, ThreadMessage, ThreadOtherReaction } from '@/types'

type Params = { params: Promise<{ id: string }> }

// GET /api/prayers/[id]/thread — the text conversation around one request:
// the team's outbound replies (prayer_responses) and the requester's inbound
// texts (inbound_messages), merged by time. A tapback quotes the text it
// reacts to, so it's pinned to that message as a small glyph; tapbacks on
// texts that aren't in the thread (the daily prayer update, the ack) come
// back separately so the client can fold them into one line. Both tables
// are service-role only, so the org check lives here, as in the respond
// route.
export async function GET(req: NextRequest, { params }: Params) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()
  const { data: request } = await service
    .from('prayer_requests')
    .select('id, org_id')
    .eq('id', id)
    .maybeSingle()
  if (!request || request.org_id !== member.orgId) {
    return NextResponse.json({ error: 'Prayer request not found.' }, { status: 404 })
  }

  const [{ data: outbound, error: outError }, { data: inbound, error: inError }] = await Promise.all([
    service
      .from('prayer_responses')
      .select('id, body, sent_at, profiles(display_name)')
      .eq('request_id', id)
      .order('sent_at'),
    service
      .from('inbound_messages')
      .select('id, body, kind, received_at')
      .eq('request_id', id)
      .order('received_at'),
  ])
  if (outError || inError) {
    return NextResponse.json({ error: 'Could not load the conversation.' }, { status: 500 })
  }

  type Joined = { display_name: string | null } | { display_name: string | null }[] | null
  const authorOf = (p: Joined) => (Array.isArray(p) ? p[0]?.display_name : p?.display_name) ?? null

  const outItems: ThreadMessage[] = (outbound ?? []).map(r => ({
    id: r.id as string,
    direction: 'out' as const,
    body: r.body as string,
    at: r.sent_at as string,
    author: authorOf(r.profiles as Joined),
    reactions: [],
  }))
  const inItems: ThreadMessage[] = []
  const other: ThreadOtherReaction[] = []

  for (const m of inbound ?? []) {
    const at = m.received_at as string
    const body = m.body as string
    if (m.kind !== 'reaction') {
      inItems.push({ id: m.id as string, direction: 'in', body, at, author: null, reactions: [] })
      continue
    }
    const glyph = reactionGlyph(body)
    const quote = tapbackQuote(body) ?? ''
    // The latest outbound before the reaction whose text it quotes.
    const target = [...outItems]
      .reverse()
      .find(o => o.at <= at && quoteMatches(quote, o.body))
    if (target) {
      target.reactions.push({ glyph, at })
    } else {
      other.push({ glyph, at, about: describeReactionTarget(quote) })
    }
  }

  const thread: Thread = {
    items: [...outItems, ...inItems].sort((a, b) => a.at.localeCompare(b.at)),
    other_reactions: other,
  }
  return NextResponse.json(thread)
}
