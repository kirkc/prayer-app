import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getSiteUrl } from '@/lib/site-url'
import { logError, logMessage } from '@/lib/log'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/members/[id]/reset-password — email a password-reset link
// to a team member. Admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()

  const { data, error: lookupError } = await service.auth.admin.getUserById(id)
  if (lookupError || !data.user?.email) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  // The link lands on the deployed app's /set-password, not the request origin.
  // This URL must be allow-listed in Supabase (Authentication → URL Configuration).
  const redirectTo = `${getSiteUrl(req)}/set-password`

  const { error } = await service.auth.resetPasswordForEmail(data.user.email, {
    redirectTo,
  })

  // Sent via Supabase Auth SMTP — the Resend webhook attaches delivery status
  // later by matching the recipient.
  await logMessage({
    channel: 'email',
    kind: 'auth.reset',
    recipient: data.user.email,
    subject: 'Password reset',
    status: error ? 'failed' : 'sent',
    errorMessage: error?.message,
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
