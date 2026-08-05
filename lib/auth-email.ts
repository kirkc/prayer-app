import type { User } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { getOrgForUser, type Org } from '@/lib/orgs'
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
    // Neutral fallback — real invites always pass orgName, which names the
    // church in the intro instead.
    intro: "You've been invited to join the prayer team. Set a password to get started.",
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
  linkType,
  org,
  meta,
}: {
  type: AuthEmailType
  email: string
  redirectBase: string
  data?: Record<string, unknown>
  // Overrides which auth link is generated while `type` keeps choosing the
  // copy. The invite flow uses this: the user is pre-created with
  // auth.admin.createUser (so the profile trigger can verify an app_metadata
  // invite marker the public signup endpoint can't forge), and a recovery
  // link — "choose your password" — is what a pre-created account needs.
  linkType?: 'recovery'
  // Which church the email speaks for (brand, sender, ops tagging). When the
  // caller doesn't know (magic link, self-service reset), it's resolved from
  // the recipient's own profile after the link is generated.
  org?: Org | null
  meta?: Record<string, unknown>
}): Promise<SendAuthEmailResult> {
  const copy = COPY[type]
  const service = createServiceClient()
  const redirectTo = `${redirectBase}${copy.landing}`

  // The link type drives both generateLink and the ?type= the landing page
  // passes to verifyOtp — they must match.
  const effectiveLinkType = linkType ?? type

  // generateLink's params are a discriminated union on `type`, so narrow
  // explicitly rather than passing a computed type.
  const linkResult =
    effectiveLinkType === 'recovery'
      ? await service.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
      : effectiveLinkType === 'magiclink'
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
      orgId: org?.id,
      meta,
    })
    return {
      user: null,
      error: error
        ? { message: error.message, status: error.status }
        : { message: 'Could not generate the link.' },
    }
  }

  // The email speaks as the recipient's church. Fallback covers only a user
  // with no profile (shouldn't exist) — it preserves the pre-multi-org
  // wording rather than sending an unbranded email.
  const brandOrg =
    org ??
    (link.user ? await getOrgForUser(service, link.user.id).catch(() => null) : null)
  const brandName = brandOrg?.name ?? 'Redemption Church Seattle'
  const intro =
    type === 'invite'
      ? `You've been invited to join the ${brandName} prayer team. Set a password to get started.`
      : copy.intro

  const url = `${redirectBase}${copy.landing}?token_hash=${link.properties.hashed_token}&type=${effectiveLinkType}`

  // sendEmail logs the send (and any Resend failure) to message_log with the
  // Resend id, so the Resend webhook attaches delivery status later.
  await sendEmail({
    to: email,
    subject: copy.subject,
    html: renderEmail({
      brandName,
      heading: copy.heading,
      intro,
      bodyHtml: copy.bodyHtml,
      cta: { label: copy.ctaLabel, url },
      footer: AUTH_FOOTER,
    }),
    kind: copy.kind,
    from: brandOrg?.from_email,
    orgId: brandOrg?.id,
    meta,
  })

  return { user: link.user, error: null }
}
