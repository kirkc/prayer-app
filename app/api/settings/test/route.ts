import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { getAppUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

// POST /api/settings/test — send a sample notification to the signed-in member
// so they can confirm delivery lands in their inbox.
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const html = renderEmail({
    heading: 'Test notification',
    intro: 'This is a test from your prayer-team notification settings. If you can read this, email notifications are working.',
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e8e8;border-radius:16px;margin-bottom:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#39484f;">You'll receive alerts like this when new prayer requests come in.</p>
      </td></tr></table>`,
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })

  try {
    await sendEmail({
      to: user.email,
      subject: 'Test notification',
      html,
      kind: 'email.test',
      meta: { profile_id: user.id },
    })
  } catch (err) {
    await logError('settings.test_email', err, { recipient: user.email })
    return NextResponse.json({ error: 'Could not send the test email.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
