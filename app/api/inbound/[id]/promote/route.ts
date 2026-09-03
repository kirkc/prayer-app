import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getApiMemberContext } from '@/lib/admin'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// POST /api/inbound/[id]/promote — a text the webhook filed as a reply was
// really a new request. Create the request from it (dated when the text
// arrived, not now) and drop the thread row. Nobody is notified: the member
// doing this is already looking at it, and it lands at the top of the feed.
export async function POST(req: NextRequest, { params }: Params) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()
  const { data: message } = await service
    .from('inbound_messages')
    .select('id, org_id, phone, body, received_at')
    .eq('id', id)
    .maybeSingle()
  if (!message || message.org_id !== member.orgId) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 })
  }

  const { data: inserted, error: insertError } = await service
    .from('prayer_requests')
    .insert({
      phone: message.phone,
      request: message.body,
      source: 'sms',
      notify_prayers: true,
      org_id: member.orgId,
      created_at: message.received_at,
    })
    .select('id')
    .single()
  if (insertError || !inserted) {
    await logError('promote.insert', insertError, { inbound_id: id })
    return NextResponse.json({ error: 'Could not create the request.' }, { status: 500 })
  }

  const { error: deleteError } = await service.from('inbound_messages').delete().eq('id', id)
  if (deleteError) {
    await logError('promote.delete', deleteError, { inbound_id: id, request_id: inserted.id })
    return NextResponse.json({ error: 'Created, but the reply could not be removed.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, request_id: inserted.id })
}
