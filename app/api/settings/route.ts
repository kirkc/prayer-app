import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'
import type { NotifyFrequency } from '@/types'

const FREQUENCIES: NotifyFrequency[] = ['immediate', 'daily', 'weekly']

// PATCH /api/settings — update the signed-in member's own notification prefs.
// User-scoped: RLS + the migration-004 column grant confine the write to their
// own row and the two editable columns.
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const update: { notify_new_requests?: boolean; notify_frequency?: NotifyFrequency } = {}

  if ('notify_new_requests' in body) {
    if (typeof body.notify_new_requests !== 'boolean') {
      return NextResponse.json({ error: 'Invalid value.' }, { status: 400 })
    }
    update.notify_new_requests = body.notify_new_requests
  }
  if ('notify_frequency' in body) {
    if (!FREQUENCIES.includes(body.notify_frequency)) {
      return NextResponse.json({ error: 'Invalid frequency.' }, { status: 400 })
    }
    update.notify_frequency = body.notify_frequency
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(update).eq('id', user.id)
  if (error) {
    await logError('settings.update', error, { profile_id: user.id })
    return NextResponse.json({ error: 'Could not save your settings.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
