import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { getSiteUrl } from '@/lib/site-url'
import { logError, logMessage } from '@/lib/log'

// POST /api/settings/reset-password — email the signed-in member a link to
// choose a new password. Self-service twin of the admin reset route; the
// link lands on /set-password like invites and admin-sent resets.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const redirectTo = `${getSiteUrl(req)}/set-password`

  const service = createServiceClient()
  const { error } = await service.auth.resetPasswordForEmail(user.email, {
    redirectTo,
  })

  // Sent via Supabase Auth SMTP — the Resend webhook attaches delivery status
  // later by matching the recipient.
  await logMessage({
    channel: 'email',
    kind: 'auth.reset',
    recipient: user.email,
    subject: 'Password reset',
    status: error ? 'failed' : 'sent',
    errorMessage: error?.message,
    meta: { requested_by: user.id, self_service: true },
  })

  if (error) {
    await logError('settings.reset_password', error, { recipient: user.email })
    const isRateLimit = error.status === 429 || /rate limit/i.test(error.message)
    return NextResponse.json(
      {
        error: isRateLimit
          ? 'Too many reset emails — please wait a few minutes and try again.'
          : 'Could not send the reset email.',
      },
      { status: isRateLimit ? 429 : 500 }
    )
  }
  return NextResponse.json({ success: true })
}
