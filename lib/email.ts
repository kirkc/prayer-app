import { Resend } from 'resend'
import { getAppUrl } from '@/lib/site-url'
import { logMessage } from '@/lib/log'

// Transactional email via Resend. This is separate from the Supabase Auth
// emails (invites / password resets) which go through Supabase's own SMTP
// settings — this client is for app-generated mail like prayer notifications.
//
// Lazily constructed so importing this module never throws when the key is
// absent (mirrors the twilio client pattern in lib/twilio.ts).
let client: Resend | null = null
function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    client = new Resend(key)
  }
  return client
}

const FROM =
  process.env.NOTIFY_FROM_EMAIL ??
  'Redemption Church Seattle <prayer@redemptionseattle.org>'

// Sends and records the attempt in message_log (kind identifies the email
// type on the ops dashboard; the Resend id lets the Resend webhook update the
// row with delivered/bounced later). Still throws on failure — callers keep
// their own error semantics.
export async function sendEmail({
  to,
  subject,
  html,
  kind = 'email.other',
  meta,
}: {
  to: string
  subject: string
  html: string
  kind?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    const { data, error } = await getClient().emails.send({ from: FROM, to, subject, html })
    if (error) throw new Error(`Resend send failed: ${error.message}`)
    await logMessage({
      channel: 'email',
      kind,
      recipient: to,
      subject,
      status: 'sent',
      providerId: data?.id ?? null,
      meta,
    })
  } catch (err) {
    await logMessage({
      channel: 'email',
      kind,
      recipient: to,
      subject,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      meta,
    })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Branded HTML template. Email clients ignore external stylesheets and are
// unreliable with web fonts, so everything is inline and the display face
// degrades to a serif stack that echoes the app's Fraunces headings.
// Palette mirrors app/globals.css (sage / mist / ink).
// ---------------------------------------------------------------------------
export function renderEmail({
  heading,
  intro,
  bodyHtml,
  cta,
  footer,
}: {
  heading: string
  intro: string
  bodyHtml: string
  cta?: { label: string; url: string }
  // Overrides the default "manage your notifications" footer. Auth emails
  // (resets, sign-in links, invites) aren't notifications, so they pass a
  // security-appropriate line instead. HTML is allowed.
  footer?: string
}): string {
  const settingsUrl = `${getAppUrl()}/settings`
  const footerHtml =
    footer ??
    `You're receiving this because notifications are on for your prayer-team account.<br/>
            <a href="${settingsUrl}" style="color:#64887e;">Manage your notifications</a>`
  const ctaHtml = cta
    ? `<tr><td style="padding: 8px 0 4px;">
         <a href="${cta.url}" style="display:inline-block;background:#4f6f66;color:#ffffff;text-decoration:none;font-size:14px;padding:10px 22px;border-radius:9999px;">${cta.label}</a>
       </td></tr>`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7fafa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e0e8e8;border-radius:24px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#a3b1b5;">Redemption Church Seattle</p>
                <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px;color:#2a363c;">${heading}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4c5e66;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0">${ctaHtml}</table>
              </td>
            </tr>
          </table>
          <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#a3b1b5;text-align:center;">
            ${footerHtml}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
