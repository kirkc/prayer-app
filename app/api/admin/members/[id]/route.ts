import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// Super admin accounts are managed by migration only — they can't be
// demoted, removed, or reset from the team UI.
async function isSuperAdminTarget(id: string): Promise<boolean> {
  const service = createServiceClient()
  const { data } = await service.from('profiles').select('role').eq('id', id).single()
  return data?.role === 'super_admin'
}

// PATCH /api/admin/members/[id] — change a team member's role and/or display
// name. Admin only ("admins and above" via getAdminUser).
export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const update: { role?: 'prayer' | 'admin'; display_name?: string | null } = {}

  if ('role' in body) {
    if (!['prayer', 'admin'].includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    // Guard against locking yourself out by demoting your own account.
    if (id === admin.id) {
      return NextResponse.json(
        { error: 'You cannot change your own role.' },
        { status: 400 }
      )
    }
    update.role = body.role
  }

  if ('display_name' in body) {
    if (body.display_name !== null && typeof body.display_name !== 'string') {
      return NextResponse.json({ error: 'Invalid name.' }, { status: 400 })
    }
    update.display_name =
      typeof body.display_name === 'string' ? body.display_name.trim() || null : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  // Super admin accounts stay migration-managed — admins can't rename or
  // re-role them here.
  if (await isSuperAdminTarget(id)) {
    return NextResponse.json(
      { error: "This account can't be changed here." },
      { status: 400 }
    )
  }

  // Writes go through the service role — authenticated users can only update
  // their own row (migration 003).
  const service = createServiceClient()
  const { error } = await service.from('profiles').update(update).eq('id', id)

  if (error) {
    await logError('admin.member_update', error, { target_id: id, update })
    return NextResponse.json({ error: 'Could not update the member.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/members/[id] — remove a team member entirely. Admin only.
// Deletes the auth user; their profile cascades away. Their prayer records
// cascade too (adjusting counts via trigger), while any replies they sent are
// kept with the author set to null.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (id === admin.id) {
    return NextResponse.json(
      { error: 'You cannot remove your own account.' },
      { status: 400 }
    )
  }
  if (await isSuperAdminTarget(id)) {
    return NextResponse.json(
      { error: "This account can't be removed here." },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)

  if (error) {
    await logError('admin.member_delete', error, { target_id: id })
    return NextResponse.json({ error: 'Could not remove the member.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
