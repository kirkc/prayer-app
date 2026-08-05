import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/members/[id]/reset-password — email a password-reset link
// to a team member. Admin only. Sent via Resend (sendAuthEmail).
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()

  // Service role bypasses RLS — confirm the target is in the caller's church
  // before the auth lookup, so cross-org ids read as missing.
  const { data: targetProfile } = await service
    .from('profiles')
    .select('org_id')
    .eq('id', id)
    .single()
  if (!targetProfile || targetProfile.org_id !== admin.orgId) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  const { data, error: lookupError } = await service.auth.admin.getUserById(id)
  if (lookupError || !data.user?.email) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  const { error } = await sendAuthEmail({
    type: 'recovery',
    email: data.user.email,
    redirectBase: getSiteUrl(req),
    orgId: admin.orgId,
    meta: { requested_by: admin.user.id },
  })

  if (error) {
    await logError('admin.reset_password', error, { recipient: data.user.email })
    return NextResponse.json(
      { error: 'Could not send the reset email.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true })
}
