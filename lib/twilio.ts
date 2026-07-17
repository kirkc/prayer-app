import twilio, { Twilio } from 'twilio'
import { logMessage } from '@/lib/log'
import { getAppUrl } from '@/lib/site-url'

let client: Twilio | null = null

// Lazily construct the Twilio client so importing this module during
// `next build` (when env vars may be absent) doesn't throw.
function getClient(): Twilio {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return client
}

// Proxy so existing `twilioClient.messages.create(...)` call sites keep working
// while construction stays deferred until first use.
export const twilioClient = {
  get messages() {
    return getClient().messages
  },
}

export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!

// Where Twilio reports per-message delivery status (delivered / undelivered /
// failed + error code). Handled by app/api/webhooks/twilio-status. Twilio
// rejects non-public URLs outright, so local dev (localhost fallback) sends
// without a callback rather than failing every send.
function statusCallbackUrl(): string | undefined {
  const url =
    process.env.TWILIO_STATUS_CALLBACK_URL ??
    `${getAppUrl()}/api/webhooks/twilio-status`
  return url.startsWith('https://') ? url : undefined
}

// Send an SMS and record it in message_log. Every outbound text goes through
// here so the ops dashboard sees a complete timeline; the status callback
// later flips the row from 'sent' to its delivery outcome via the MessageSid.
// Rethrows on failure — call sites keep their own error semantics.
export async function sendSms(opts: {
  to: string
  body: string
  kind: string
  meta?: Record<string, unknown>
}): Promise<{ sid: string }> {
  try {
    const sent = await getClient().messages.create({
      body: opts.body,
      from: TWILIO_PHONE_NUMBER,
      to: opts.to,
      statusCallback: statusCallbackUrl(),
    })
    await logMessage({
      channel: 'sms',
      kind: opts.kind,
      recipient: opts.to,
      bodyPreview: opts.body,
      status: 'sent',
      providerId: sent.sid,
      meta: opts.meta,
    })
    return { sid: sent.sid }
  } catch (err) {
    await logMessage({
      channel: 'sms',
      kind: opts.kind,
      recipient: opts.to,
      bodyPreview: opts.body,
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
      meta: opts.meta,
    })
    throw err
  }
}

export type TwilioHealth = {
  balance: string
  currency: string
  usage: { category: string; count: string; price: number }[]
}

// Account balance + this month's usage for the ops dashboard. Returns null on
// any failure (missing creds, API error) so the page can render a quiet
// "unavailable" state instead of erroring.
export async function getTwilioHealth(): Promise<TwilioHealth | null> {
  try {
    const c = getClient()
    const [balance, usage] = await Promise.all([
      c.balance.fetch(),
      c.usage.records.thisMonth.list({ limit: 10 }),
    ])
    return {
      balance: balance.balance,
      currency: balance.currency,
      usage: usage
        .filter(u => Number(u.count) > 0)
        .map(u => ({ category: u.category, count: u.count, price: u.price })),
    }
  } catch (err) {
    console.error('[twilio.health]', err)
    return null
  }
}
