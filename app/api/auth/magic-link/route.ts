import { NextRequest, NextResponse } from 'next/server'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { logError } from '@/lib/log'

// POST /api/auth/magic-link — email a passwordless sign-in link. Public (no
// session yet). Sent via Resend (sendAuthEmail); the link lands on /auth/confirm.
//
// generateLink (type: 'magiclink') only succeeds for existing users and never
// creates one, preserving the previous shouldCreateUser:false behaviour. We
// always respond 200 and log failures server-side so the endpoint can't be used
// to probe which emails have accounts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  // The old client-side signInWithOtp path was rate-limited by Supabase; this
  // endpoint sends through Resend, so it must throttle itself or it can be
  // used to email-bomb a member and burn send quota.
  if (
    !rateLimit(`magic-link:ip:${clientIp(req)}`, { limit: 5, windowMs: 15 * 60_000 }) ||
    !rateLimit(`magic-link:email:${email}`, { limit: 3, windowMs: 15 * 60_000 })
  ) {
    return NextResponse.json(
      { error: 'Too many sign-in links requested — please wait a few minutes.' },
      { status: 429 }
    )
  }

  try {
    const { error } = await sendAuthEmail({
      type: 'magiclink',
      email,
      redirectBase: getSiteUrl(req),
    })
    // A generate error here is almost always "no such user" — swallow it so we
    // don't reveal account existence.
    if (error) await logError('auth.magic_link', error, { recipient: email })
  } catch (err) {
    await logError('auth.magic_link', err, { recipient: email })
  }

  return NextResponse.json({ success: true })
}
