import { createServiceClient } from '@/lib/supabase-server'
import type { MessageStatus } from '@/types'

// Persistent operational logging, surfaced at /admin/ops. Both helpers write
// with the service role (the tables have no grants for anon/authenticated)
// and NEVER throw — a logging failure must not break the send path it is
// observing. The console.* calls stay so Vercel function logs remain useful.

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      // Twilio/Supabase errors carry extra fields (code, status, etc.)
      ...Object.fromEntries(
        Object.entries(err as unknown as Record<string, unknown>).filter(
          ([, v]) => typeof v !== 'object' || v === null
        )
      ),
    }
  }
  if (typeof err === 'object' && err !== null) return { ...err }
  return { value: String(err) }
}

// Not every upstream failure hands back a sentence. Supabase behind Cloudflare
// answers a blocked request with a whole HTML page, and three of those landed
// in app_errors on 2026-09-01 — six kilobytes each, unreadable on the ops
// dashboard and impossible to group by. The full body still goes to `detail`;
// `message` gets the short version.
const MAX_MESSAGE = 500

function condenseMessage(raw: string): string {
  const m = raw.trim()
  if (/^<(!doctype|html)\b/i.test(m)) {
    const title = m.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()
    return `Upstream returned an HTML error page${title ? `: ${title}` : ''}`
  }
  return m.length > MAX_MESSAGE ? m.slice(0, MAX_MESSAGE) + '…' : m
}

export async function logError(
  scope: string,
  err: unknown,
  detail?: Record<string, unknown>
): Promise<void> {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)

  console.error(`[${scope}]`, err)
  try {
    const service = createServiceClient()
    await service.from('app_errors').insert({
      scope,
      message: condenseMessage(message),
      detail: { error: serializeError(err), ...detail },
    })
  } catch (logErr) {
    console.error(`[log.app_errors] failed to persist ${scope}:`, logErr)
  }
}

export type MessageLogInput = {
  channel: 'sms' | 'email'
  kind: string
  recipient: string
  subject?: string
  bodyPreview?: string
  status: Extract<MessageStatus, 'sent' | 'failed'>
  providerId?: string | null
  errorMessage?: string
  orgId?: string | null
  meta?: Record<string, unknown>
}

export async function logMessage(entry: MessageLogInput): Promise<void> {
  try {
    const service = createServiceClient()
    await service.from('message_log').insert({
      channel: entry.channel,
      kind: entry.kind,
      recipient: entry.recipient,
      subject: entry.subject ?? null,
      body_preview: entry.bodyPreview?.slice(0, 160) ?? null,
      status: entry.status,
      provider_id: entry.providerId ?? null,
      error_message: entry.errorMessage ?? null,
      org_id: entry.orgId ?? null,
      meta: entry.meta ?? null,
    })
  } catch (logErr) {
    console.error(`[log.message_log] failed to persist ${entry.kind}:`, logErr)
  }
}
