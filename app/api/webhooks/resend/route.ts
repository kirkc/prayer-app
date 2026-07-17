import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

// POST /api/webhooks/resend — Resend email events (svix-signed). Because
// Supabase Auth SMTP also sends through this Resend account, delivery status
// arrives here for ALL mail: app-sent (matched by Resend email id), auth
// invites/resets the app logged without an id (matched by recipient), and
// Supabase-initiated mail the app never saw (recorded as 'email.observed').

const STATUS_BY_EVENT: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
  'email.failed': 'failed',
}

// 'sent' must never overwrite a terminal status that arrived first.
const TERMINAL = ['delivered', 'bounced', 'complained', 'failed']

type ResendEvent = {
  type: string
  data: {
    email_id?: string
    to?: string[] | string
    subject?: string
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!secret) return new NextResponse('Not configured', { status: 503 })
    try {
      new Webhook(secret).verify(payload, {
        'svix-id': req.headers.get('svix-id') ?? '',
        'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
        'svix-signature': req.headers.get('svix-signature') ?? '',
      })
    } catch {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  let event: ResendEvent
  try {
    event = JSON.parse(payload)
  } catch {
    return new NextResponse('Bad request', { status: 400 })
  }

  const status = STATUS_BY_EVENT[event.type]
  const emailId = event.data?.email_id
  if (!status || !emailId) return new NextResponse(null, { status: 204 })

  const recipient = Array.isArray(event.data.to) ? event.data.to[0] : event.data.to
  const now = new Date().toISOString()
  const service = createServiceClient()

  // 1. App-sent mail: match by the Resend email id captured at send time.
  const { data: byId, error: byIdError } = await service
    .from('message_log')
    .select('id, status')
    .eq('provider_id', emailId)
    .maybeSingle()
  if (byIdError) {
    await logError('webhook.resend', byIdError, { emailId, status })
    return new NextResponse(null, { status: 204 })
  }
  if (byId) {
    // Events can arrive out of order — 'sent' must not clobber a terminal
    // status that got here first.
    if (!(status === 'sent' && TERMINAL.includes(byId.status))) {
      await service
        .from('message_log')
        .update({ status, status_updated_at: now })
        .eq('id', byId.id)
    }
    return new NextResponse(null, { status: 204 })
  }

  // 2. Auth mail the app logged without an id (invites, resets): attach the
  //    id + status to the most recent matching recipient row.
  if (recipient) {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: candidate } = await service
      .from('message_log')
      .select('id, status')
      .eq('channel', 'email')
      .eq('recipient', recipient)
      .is('provider_id', null)
      .gt('created_at', fifteenMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (candidate) {
      const keepStatus = status === 'sent' && TERMINAL.includes(candidate.status)
      await service
        .from('message_log')
        .update({
          provider_id: emailId,
          ...(keepStatus ? {} : { status, status_updated_at: now }),
        })
        .eq('id', candidate.id)
      return new NextResponse(null, { status: 204 })
    }
  }

  // 3. Mail the app never saw (magic links, user-triggered resets sent by
  //    Supabase directly): record it so the ops log is complete.
  if (recipient) {
    await service.from('message_log').insert({
      channel: 'email',
      kind: 'email.observed',
      recipient,
      subject: event.data.subject ?? null,
      status,
      provider_id: emailId,
      status_updated_at: now,
    })
  }

  return new NextResponse(null, { status: 204 })
}
