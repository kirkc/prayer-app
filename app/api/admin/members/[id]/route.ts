import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/admin/members/[id] — change a team member's role. Admin only.
export async function PATCH(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { role } = await req.json().catch(() => ({}))

  if (!['prayer', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  // Guard against locking yourself out by demoting your own account.
  if (id === admin.id) {
    return NextResponse.json(
      { error: 'You cannot change your own role.' },
      { status: 400 }
    )
  }

  // Role changes are done with the service role — authenticated users can
  // only update display_name (migration 003).
  const service = createServiceClient()
  const { error } = await service.from('profiles').update({ role }).eq('id', id)

  if (error) {
    console.error('Role update error:', error)
    return NextResponse.json({ error: 'Could not update role.' }, { status: 500 })
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

  const service = createServiceClient()
  const { error } = await service.auth.admin.deleteUser(id)

  if (error) {
    console.error('Member delete error:', error)
    return NextResponse.json({ error: 'Could not remove the member.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
