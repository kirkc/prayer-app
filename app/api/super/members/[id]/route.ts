import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'
import type { NotifyFrequency } from '@/types'

type Params = { params: Promise<{ id: string }> }

const FREQUENCIES: NotifyFrequency[] = ['immediate', 'daily', 'weekly']

// PATCH /api/super/members/[id] — edit any member's settings. Super admin
// only; writes go through the service role since RLS confines authenticated
// users to their own row.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSuperAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const service = createServiceClient()

  // The super admin's own row stays migration-managed (role especially).
  const { data: target } = await service
    .from('profiles')
    .select('role')
    .eq('id', id)
    .single()
  if (!target) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }
  if (target.role === 'super_admin' && 'role' in body) {
    return NextResponse.json(
      { error: "The super admin role can't be changed here." },
      { status: 400 }
    )
  }

  const update: {
    display_name?: string | null
    notify_new_requests?: boolean
    notify_frequency?: NotifyFrequency
    role?: 'prayer' | 'admin'
  } = {}

  if ('display_name' in body) {
    if (body.display_name !== null && typeof body.display_name !== 'string') {
      return NextResponse.json({ error: 'Invalid name.' }, { status: 400 })
    }
    update.display_name =
      typeof body.display_name === 'string' ? body.display_name.trim() || null : null
  }
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
  if ('role' in body) {
    if (!['prayer', 'admin'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }
    update.role = body.role
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const { error } = await service.from('profiles').update(update).eq('id', id)
  if (error) {
    await logError('super.member_update', error, { target_id: id })
    return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
