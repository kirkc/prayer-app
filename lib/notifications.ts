import { createServiceClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { getAppUrl } from '@/lib/site-url'
import type { NotifyFrequency } from '@/types'

// The non-sensitive slice of a prayer request we're willing to put in an email.
// Deliberately no `phone` — that never leaves the server (see migration 002).
export type NewRequestSummary = {
  name: string | null
  request: string
  source: 'web' | 'sms'
}

export type Recipient = {
  id: string
  email: string
  display_name: string | null
  notify_last_sent_at: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string, n = 500): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function requestCardHtml(r: NewRequestSummary): string {
  const who = escapeHtml(r.name?.trim() || 'Anonymous')
  const tag = r.source === 'sms' ? 'via text' : 'via web'
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e8e8;border-radius:16px;margin-bottom:12px;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0 0 6px;font-size:13px;color:#81959b;">${who} · ${tag}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#39484f;white-space:pre-wrap;">${escapeHtml(truncate(r.request.trim()))}</p>
    </td></tr>
  </table>`
}

// Team members who have new-request emails on, at the given cadence. Emails
// live in auth.users (not profiles), so we map them the same way the admin
// page does. listUsers paginates at 50/page — fine for a church team; revisit
// if the roster ever grows past that.
export async function getEligibleRecipients(
  frequency: NotifyFrequency
): Promise<Recipient[]> {
  const service = createServiceClient()

  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, display_name, notify_last_sent_at')
    .eq('notify_new_requests', true)
    .eq('notify_frequency', frequency)
  if (error) {
    console.error('getEligibleRecipients profiles error:', error)
    return []
  }
  if (!profiles || profiles.length === 0) return []

  const { data: authData } = await service.auth.admin.listUsers()
  const emailById = new Map((authData?.users ?? []).map(u => [u.id, u.email ?? '']))

  return profiles
    .map(p => ({
      id: p.id as string,
      display_name: p.display_name as string | null,
      notify_last_sent_at: p.notify_last_sent_at as string | null,
      email: emailById.get(p.id as string) ?? '',
    }))
    .filter(r => r.email)
}

// Immediate fan-out: email every 'immediate' subscriber about one new request.
// Never throws — a bad address for one member must not break ingestion.
export async function notifyNewRequest(summary: NewRequestSummary): Promise<void> {
  const recipients = await getEligibleRecipients('immediate')
  if (recipients.length === 0) return

  const html = renderEmail({
    heading: 'New prayer request',
    intro: 'A new request just came in for the prayer team.',
    bodyHtml: requestCardHtml(summary),
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })

  await Promise.all(
    recipients.map(async r => {
      try {
        await sendEmail({ to: r.email, subject: 'New prayer request', html })
      } catch (err) {
        console.error(`Notify ${r.email} failed:`, err)
      }
    })
  )
}

// Digest / periodic summary for one recipient. Called by the cron route with a
// window of requests already gathered for that user's cadence.
export async function sendDigestEmail(
  recipient: Recipient,
  requests: NewRequestSummary[],
  opts: { period: 'daily' | 'weekly'; activeTotal: number }
): Promise<void> {
  const count = requests.length
  const label = opts.period === 'daily' ? 'today' : 'this week'
  const html = renderEmail({
    heading: `${count} new prayer ${count === 1 ? 'request' : 'requests'} ${label}`,
    intro: `Here's your ${opts.period} summary. There ${opts.activeTotal === 1 ? 'is' : 'are'} ${opts.activeTotal} active ${opts.activeTotal === 1 ? 'request' : 'requests'} in all.`,
    bodyHtml: requests.map(requestCardHtml).join(''),
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })
  await sendEmail({
    to: recipient.email,
    subject: `Prayer requests — ${opts.period} summary`,
    html,
  })
}
