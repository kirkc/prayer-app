import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/members/[id]/reset-password — email a password-reset link
// to a team member. Admin only. Sent via Resend (sendAuthEmail).
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()

  const { data, error: lookupError } = await service.auth.admin.getUserById(id)
  if (lookupError || !data.user?.email) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  const { error } = await sendAuthEmail({
    type: 'recovery',
    email: data.user.email,
    redirectBase: getSiteUrl(req),
    meta: { requested_by: admin.id },
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
