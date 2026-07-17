import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/prayers/[id] — change status (archive / spam / restore).
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
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
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('prayer_requests').delete().eq('id', id)

  if (error) {
    await logError('prayers.delete', error, { request_id: id })
    return NextResponse.json({ error: 'Could not delete request.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
