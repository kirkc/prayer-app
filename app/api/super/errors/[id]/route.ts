import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// PATCH /api/super/errors/[id] — mark an error resolved (or reopen it).
// Super admin only.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getSuperAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { resolved } = await req.json().catch(() => ({}))
  if (typeof resolved !== 'boolean') {
    return NextResponse.json({ error: 'Invalid value.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('app_errors')
    .update(
      resolved
        ? { resolved_at: new Date().toISOString(), resolved_by: user.id }
        : { resolved_at: null, resolved_by: null }
    )
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Could not update the error.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
