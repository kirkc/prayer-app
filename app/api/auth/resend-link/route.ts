import { NextRequest, NextResponse } from 'next/server'
import { sendAuthEmail, type AuthEmailType } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { logError } from '@/lib/log'

// POST /api/auth/resend-link — email a fresh /set-password link to someone
// whose invite or reset link expired. Public by necessity: not being able to
// sign in is the whole problem, so there's no session to check.
//
// Same shape as /api/auth/magic-link: always 200, failures logged server-side,
// so the endpoint can't be used to probe which emails have accounts. The link
// is always a recovery ("choose your password") link — the only thing `type`
// changes is the wording, since someone who was invited and never signed in
// hasn't got a password to "reset".
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  // Comes from the ?type= on the dead link the member just opened. It only
  // picks copy, never access, so a forged value costs nothing.
  const type: AuthEmailType = body.type === 'invite' ? 'invite' : 'recovery'

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  // Sends through Resend, so it must throttle itself or it can be used to
  // email-bomb a member and burn send quota.
  if (
    !rateLimit(`resend-link:ip:${clientIp(req)}`, { limit: 5, windowMs: 15 * 60_000 }) ||
    !rateLimit(`resend-link:email:${email}`, { limit: 3, windowMs: 15 * 60_000 })
  ) {
    return NextResponse.json(
      { error: 'Too many links requested — please wait a few minutes.' },
      { status: 429 }
    )
  }

  try {
    const { error } = await sendAuthEmail({
      type,
      linkType: 'recovery',
      email,
      redirectBase: getSiteUrl(req),
      meta: { self_service_resend: true },
    })
    // Almost always "no such user" — swallow it so we don't reveal whether
    // the address has an account.
    if (error) await logError('auth.resend_link', error, { recipient: email })
  } catch (err) {
    await logError('auth.resend_link', err, { recipient: email })
  }

  return NextResponse.json({ success: true })
}
