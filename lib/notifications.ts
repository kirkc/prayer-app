import { createServiceClient } from '@/lib/supabase-server'
import { sendEmail, renderEmail } from '@/lib/email'
import { sendPushes } from '@/lib/apns'
import { getAppUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'
import type { Org } from '@/lib/orgs'
import type { NotifyFrequency } from '@/types'

// The non-sensitive slice of a prayer request we're willing to put in an email.
// Deliberately no `phone` — that never leaves the server (see migration 002).
export type NewRequestSummary = {
  // Present when the ingest path captured the inserted row's id — lets the
  // push notification deep-link straight to the request.
  id?: string
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

// Team members of one org who have new-request emails on, at the given
// cadence. Emails live in auth.users (not profiles), so we map them the same
// way the admin page does.
export async function getEligibleRecipients(
  frequency: NotifyFrequency,
  orgId: string
): Promise<Recipient[]> {
  const service = createServiceClient()

  const { data: profiles, error } = await service
    .from('profiles')
    .select('id, display_name, notify_last_sent_at')
    .eq('notify_new_requests', true)
    .eq('notify_frequency', frequency)
    .eq('org_id', orgId)
  if (error) {
    // Returning [] here means zero notifications this run — worth a record,
    // since it otherwise looks identical to "nobody subscribed".
    await logError('notify.recipients_query', error, { frequency, org_id: orgId })
    return []
  }
  if (!profiles || profiles.length === 0) return []

  const { data: authData } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
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

// Instant push to every org member with push on. Deliberately independent of
// the email cadence — a member on a weekly digest still feels the tap.
async function pushNewRequest(summary: NewRequestSummary, org: Org): Promise<void> {
  const service = createServiceClient()
  const { data: rows, error } = await service
    .from('device_tokens')
    .select('token, environment, profiles!inner(notify_push, org_id)')
    .eq('profiles.org_id', org.id)
    .eq('profiles.notify_push', true)
  if (error) {
    await logError('push.recipients_query', error, { org_id: org.id })
    return
  }
  if (!rows || rows.length === 0) return

  const who = summary.name?.trim() || 'Anonymous'
  await sendPushes(
    rows.map(r => ({
      token: r.token as string,
      environment: r.environment as 'sandbox' | 'production',
      title: 'New prayer request',
      body: `${who} · ${truncate(summary.request.trim(), 120)}`,
      data: summary.id ? { request_id: summary.id } : undefined,
      threadId: org.slug,
    }))
  )
}

// Immediate fan-out: push + email the org's subscribers about one new
// request. Never throws — a bad address for one member must not break
// ingestion.
export async function notifyNewRequest(
  summary: NewRequestSummary,
  org: Org
): Promise<void> {
  await pushNewRequest(summary, org).catch(err => logError('push.fanout', err))

  const recipients = await getEligibleRecipients('immediate', org.id)
  if (recipients.length === 0) return

  const html = renderEmail({
    brandName: org.name,
    heading: 'New prayer request',
    intro: 'A new request just came in for the prayer team.',
    bodyHtml: requestCardHtml(summary),
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })

  await Promise.all(
    recipients.map(async r => {
      try {
        await sendEmail({
          to: r.email,
          subject: 'New prayer request',
          html,
          kind: 'email.new_request',
          from: org.from_email,
          orgId: org.id,
          meta: { profile_id: r.id },
        })
      } catch (err) {
        await logError('notify.immediate', err, { recipient: r.email })
      }
    })
  )
}

// Digest / periodic summary for one recipient. Called by the cron route with a
// window of requests already gathered for that user's cadence.
export async function sendDigestEmail(
  recipient: Recipient,
  requests: NewRequestSummary[],
  opts: { period: 'daily' | 'weekly'; activeTotal: number; org: Org }
): Promise<void> {
  const count = requests.length
  const label = opts.period === 'daily' ? 'today' : 'this week'
  const html = renderEmail({
    brandName: opts.org.name,
    heading: `${count} new prayer ${count === 1 ? 'request' : 'requests'} ${label}`,
    intro: `Here's your ${opts.period} summary. There ${opts.activeTotal === 1 ? 'is' : 'are'} ${opts.activeTotal} active ${opts.activeTotal === 1 ? 'request' : 'requests'} in all.`,
    bodyHtml: requests.map(requestCardHtml).join(''),
    cta: { label: 'Open the dashboard', url: `${getAppUrl()}/dashboard` },
  })
  await sendEmail({
    to: recipient.email,
    subject: `Prayer requests — ${opts.period} summary`,
    html,
    kind: 'email.digest',
    from: opts.org.from_email,
    orgId: opts.org.id,
    meta: { profile_id: recipient.id, period: opts.period, count },
  })
}
