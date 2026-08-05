import { NextRequest, NextResponse } from 'next/server'
import { createApiContext } from '@/lib/supabase-server'
import { PRAYER_COLUMNS } from '@/lib/prayers'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// GET /api/prayers/[id] — one request with the caller's you_prayed state.
// Added for the iOS app (push notifications deep-link here). RLS scopes the
// read to the caller's church, so a foreign id is simply not found.
export async function GET(req: NextRequest, { params }: Params) {
  const { supabase, user } = await createApiContext(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: request } = await supabase
    .from('prayer_requests')
    .select(PRAYER_COLUMNS)
    .eq('id', id)
    .single()

  if (!request) {
    return NextResponse.json({ error: 'Prayer request not found.' }, { status: 404 })
  }

  const { data: mine } = await supabase
    .from('prayers')
    .select('request_id')
    .eq('profile_id', user.id)
    .eq('request_id', id)

  return NextResponse.json({ ...request, you_prayed: (mine ?? []).length > 0 })
}

// PATCH /api/prayers/[id] — change status (archive / spam / restore).
export async function PATCH(req: NextRequest, { params }: Params) {
  const { supabase, user } = await createApiContext(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { status } = await req.json().catch(() => ({}))

  if (!['active', 'archived', 'spam'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('prayer_requests')
    .update({ status })
    .eq('id', id)

  if (error) {
    await logError('prayers.status_update', error, { request_id: id, status })
    return NextResponse.json({ error: 'Could not update request.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// DELETE /api/prayers/[id] — permanently remove a request.
export async function DELETE(req: NextRequest, { params }: Params) {
  const { supabase, user } = await createApiContext(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('prayer_requests').delete().eq('id', id)

  if (error) {
    await logError('prayers.delete', error, { request_id: id })
    return NextResponse.json({ error: 'Could not delete request.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
