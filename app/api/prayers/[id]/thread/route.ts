import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getApiMemberContext } from '@/lib/admin'
import type { ThreadMessage } from '@/types'

type Params = { params: Promise<{ id: string }> }

// GET /api/prayers/[id]/thread — the text conversation around one request:
// the team's outbound replies (prayer_responses) and the requester's inbound
// texts (inbound_messages), merged by time. Both tables are service-role
// only, so the org check lives here, as in the respond route.
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

  const items: ThreadMessage[] = [
    ...(outbound ?? []).map(r => ({
      id: r.id as string,
      direction: 'out' as const,
      kind: 'reply' as const,
      body: r.body as string,
      at: r.sent_at as string,
      author: authorOf(r.profiles as Joined),
    })),
    ...(inbound ?? []).map(m => ({
      id: m.id as string,
      direction: 'in' as const,
      kind: m.kind as 'reply' | 'reaction',
      body: m.body as string,
      at: m.received_at as string,
      author: null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return NextResponse.json({ items })
}
