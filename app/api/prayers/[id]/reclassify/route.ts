import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getApiMemberContext } from '@/lib/admin'
import { findRequestForPhone } from '@/lib/sms-inbound'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// POST /api/prayers/[id]/reclassify { to: 'thread' } — a text the webhook
// filed as a request was really a reply. Move it into the thread of this
// number's previous active request and drop the request row. The reverse
// lives at /api/inbound/[id]/promote.
export async function POST(req: NextRequest, { params }: Params) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { to } = await req.json().catch(() => ({}))
  if (to !== 'thread') {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: request } = await service
    .from('prayer_requests')
    .select('id, org_id, phone, request, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!request || request.org_id !== member.orgId) {
    return NextResponse.json({ error: 'Prayer request not found.' }, { status: 404 })
  }
  if (!request.phone) {
    return NextResponse.json({ error: 'This request has no phone number.' }, { status: 400 })
  }

  let targetId: string | null
  try {
    targetId = await findRequestForPhone(service, {
      orgId: member.orgId,
      phone: request.phone as string,
      activeOnly: true,
      before: request.created_at as string,
    })
  } catch (err) {
    await logError('reclassify.lookup', err, { request_id: id })
    return NextResponse.json({ error: 'Could not move the request.' }, { status: 500 })
  }
  if (!targetId) {
    return NextResponse.json(
      { error: 'No earlier request from this number to attach it to.' },
      { status: 400 }
    )
  }

  const { error: insertError } = await service.from('inbound_messages').insert({
    org_id: member.orgId,
    request_id: targetId,
    phone: request.phone,
    body: request.request,
    kind: 'reply',
    received_at: request.created_at,
  })
  if (insertError) {
    await logError('reclassify.insert', insertError, { request_id: id, target_id: targetId })
    return NextResponse.json({ error: 'Could not move the request.' }, { status: 500 })
  }

  // The thread now holds the text; the request row is the duplicate.
  const { error: deleteError } = await service.from('prayer_requests').delete().eq('id', id)
  if (deleteError) {
    await logError('reclassify.delete', deleteError, { request_id: id, target_id: targetId })
    return NextResponse.json({ error: 'Moved, but the original could not be removed.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, target_id: targetId })
}
