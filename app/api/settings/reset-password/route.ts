import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

// POST /api/settings/reset-password — email the signed-in member a link to
// choose a new password. Self-service twin of the admin reset route; the link
// lands on /set-password like invites and admin-sent resets. Sent via Resend
// (sendAuthEmail), not Supabase Auth SMTP.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await sendAuthEmail({
    type: 'recovery',
    email: user.email,
    redirectBase: getSiteUrl(req),
    meta: { requested_by: user.id, self_service: true },
  })

  if (error) {
    await logError('settings.reset_password', error, { recipient: user.email })
    return NextResponse.json(
      { error: 'Could not send the reset email.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true })
}
