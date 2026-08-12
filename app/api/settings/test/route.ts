import { NextRequest, NextResponse } from 'next/server'
import { createApiContext, createServiceClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { sendPushes, apnsConfigured } from '@/lib/apns'
import { getOrgForUser } from '@/lib/orgs'
import { getAppUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

// POST /api/settings/test — send a sample notification to the signed-in member
// so they can confirm delivery lands in their inbox and on their phone.
//
// This doubles as the only way to prove the push pipeline works end to end
// without waiting for a real congregant to submit a request. It reports each
// channel separately and on purpose: an unconfigured APNs key and a member with
// no registered device both send zero pushes, and during a release you need to
// know which one you're looking at.
export async function POST(req: NextRequest) {
  const { user } = await createApiContext(req)
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const org = await getOrgForUser(service, user.id).catch(() => null)
  if (!org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const html = renderEmail({
    brandName: org.name,
    heading: 'Test notification',
    intro: 'This is a test from your prayer-team notification settings. If you can read this, email notifications are working.',
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e8e8;border-radius:16px;margin-bottom:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#39484f;">You'll receive alerts like this when new prayer requests come in.</p>
      </td></tr></table>`,
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })

  let emailSent = false
  try {
    await sendEmail({
      to: user.email,
      subject: 'Test notification',
      html,
      kind: 'email.test',
      from: org.from_email,
      orgId: org.id,
      meta: { profile_id: user.id },
    })
    emailSent = true
  } catch (err) {
    // Keep going — a bad email address shouldn't hide the push result.
    await logError('settings.test_email', err, { recipient: user.email })
  }

  // Only this member's own devices, whatever their notify_push preference: the
  // point is to test the wiring, and silently skipping because a toggle is off
  // would be indistinguishable from a broken key.
  const { data: devices, error: devicesError } = await service
    .from('device_tokens')
    .select('token, environment')
    .eq('profile_id', user.id)
  if (devicesError) await logError('settings.test_devices', devicesError, { profile_id: user.id })

  const configured = apnsConfigured()
  let sent = 0
  let failed = 0
  if (configured && devices && devices.length > 0) {
    const result = await sendPushes(
      devices.map(d => ({
        token: d.token as string,
        environment: d.environment as 'sandbox' | 'production',
        title: 'Test notification',
        body: 'Push notifications are working. This is the only alert you asked for.',
        threadId: org.slug,
      }))
    ).catch(async err => {
      await logError('settings.test_push', err, { profile_id: user.id })
      return { sent: 0, failed: devices.length }
    })
    sent = result.sent
    failed = result.failed
  }

  if (!emailSent && sent === 0) {
    return NextResponse.json({ error: 'Could not send the test notification.' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    email: emailSent,
    push: { configured, devices: devices?.length ?? 0, sent, failed },
  })
}
