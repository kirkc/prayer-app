import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

async function currentCount(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  id: string
): Promise<number> {
  const { data } = await supabase
    .from('prayer_requests')
    .select('prayed_count')
    .eq('id', id)
    .single()
  return data?.prayed_count ?? 0
}

// POST /api/prayers/[id]/pray — record that the current user prayed.
// Idempotent: the unique (request_id, profile_id) constraint prevents dupes.
export async function POST(_req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('prayers')
    .upsert(
      { request_id: id, profile_id: user.id },
      { onConflict: 'request_id,profile_id', ignoreDuplicates: true }
    )

  if (error) {
    await logError('prayers.pray_insert', error, { request_id: id })
    return NextResponse.json({ error: 'Could not record prayer.' }, { status: 500 })
  }

  return NextResponse.json({ you_prayed: true, prayed_count: await currentCount(supabase, id) })
}

// DELETE /api/prayers/[id]/pray — undo a prayer (toggle off).
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('prayers')
    .delete()
    .eq('request_id', id)
    .eq('profile_id', user.id)

  if (error) {
    await logError('prayers.pray_delete', error, { request_id: id })
    return NextResponse.json({ error: 'Could not update prayer.' }, { status: 500 })
  }

  return NextResponse.json({ you_prayed: false, prayed_count: await currentCount(supabase, id) })
}
