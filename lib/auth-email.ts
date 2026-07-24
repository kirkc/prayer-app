import type { User } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { logMessage } from '@/lib/log'

// Account (auth) emails — password resets, sign-in links, invites — sent through
// Resend instead of Supabase Auth's built-in SMTP. Supabase's SMTP path was the
// source of both timeouts and spam (unauthenticated sender for our domain), so
// we generate the auth link with the admin API and email it ourselves from the
// same Resend-verified domain the notification emails already use.
//
// The link lands on one of our own pages (/set-password or /auth/confirm) with a
// `token_hash`, which those pages verify with `supabase.auth.verifyOtp` — the
// documented pattern for custom-sent auth mail.

export type AuthEmailType = 'recovery' | 'magiclink' | 'invite'

type Copy = {
  landing: string
  kind: string
  subject: string
  heading: string
  intro: string
  ctaLabel: string
  bodyHtml: string
}

const NOTE =
  '<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4c5e66;">This link expires in one hour and can only be used once.</p>'

const COPY: Record<AuthEmailType, Copy> = {
  recovery: {
    landing: '/set-password',
    kind: 'auth.reset',
    subject: 'Reset your password',
    heading: 'Reset your password',
    intro:
      'We received a request to reset the password for your prayer-team account. Choose a new one below.',
    ctaLabel: 'Choose a new password',
    bodyHtml: NOTE,
  },
  magiclink: {
    landing: '/auth/confirm',
    kind: 'auth.magiclink',
    subject: 'Your sign-in link',
    heading: 'Sign in to the prayer team',
    intro: 'Use the link below to sign in to your prayer-team account — no password needed.',
    ctaLabel: 'Sign in',
    bodyHtml:
      '<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4c5e66;">This link expires in one hour and can only be used once. Open it on this device to be signed straight in.</p>',
  },
  invite: {
    landing: '/set-password',
    kind: 'auth.invite',
    subject: "You're invited to the prayer team",
    heading: "You're invited",
    intro:
      "You've been invited to join the Redemption Church Seattle prayer team. Set a password to get started.",
    ctaLabel: 'Accept invite',
    bodyHtml: NOTE,
  },
}

const AUTH_FOOTER =
  "If you didn't request this email, you can safely ignore it — no changes will be made to your account."

type SendAuthEmailResult = {
  user: User | null
  error: { message: string; status?: number } | null
}

// Generates the auth link (service role) and emails it via Resend. Returns the
// (possibly newly created, for invites) user and any Supabase error so callers
// can map it to a user-facing message. Never throws for the generate step — a
// Resend send failure still propagates from sendEmail as before.
export async function sendAuthEmail({
  type,
  email,
  redirectBase,
  data,
  meta,
}: {
  type: AuthEmailType
  email: string
  redirectBase: string
  data?: Record<string, unknown>
  meta?: Record<string, unknown>
}): Promise<SendAuthEmailResult> {
  const copy = COPY[type]
  const service = createServiceClient()
  const redirectTo = `${redirectBase}${copy.landing}`

  // generateLink's params are a discriminated union on `type`, so narrow
  // explicitly rather than passing a computed type.
  const linkResult =
    type === 'recovery'
      ? await service.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      : type === 'magiclink'
        ? await service.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
        : await service.auth.admin.generateLink({ type: 'invite', email, options: { data, redirectTo } })

  const { data: link, error } = linkResult

  if (error || !link?.properties) {
    // No email goes out; still record the failed attempt so /admin/ops shows it.
    await logMessage({
      channel: 'email',
      kind: copy.kind,
      recipient: email,
      subject: copy.subject,
      status: 'failed',
      errorMessage: error?.message,
      meta,
    })
    return {
      user: null,
      error: error
        ? { message: error.message, status: error.status }
        : { message: 'Could not generate the link.' },
    }
  }

  const url = `${redirectBase}${copy.landing}?token_hash=${link.properties.hashed_token}&type=${type}`

  // sendEmail logs the send (and any Resend failure) to message_log with the
  // Resend id, so the Resend webhook attaches delivery status later.
  await sendEmail({
    to: email,
    subject: copy.subject,
    html: renderEmail({
      heading: copy.heading,
      intro: copy.intro,
      bodyHtml: copy.bodyHtml,
      cta: { label: copy.ctaLabel, url },
      footer: AUTH_FOOTER,
    }),
    kind: copy.kind,
    meta,
  })

  return { user: link.user, error: null }
}
