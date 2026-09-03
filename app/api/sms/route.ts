import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSms } from '@/lib/twilio'
import { notifyNewRequest, notifyReply } from '@/lib/notifications'
import { getOrgByTwilioPhone, type Org } from '@/lib/orgs'
import { logError } from '@/lib/log'
import {
  classifyInbound,
  findRecentOutbound,
  resolveReplyTarget,
  REPLY_WINDOW_HOURS,
} from '@/lib/sms-inbound'
import type { SupabaseClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const EMPTY_TWIML = () =>
  new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } })

// People react to and answer the texts we send. Neither is a prayer request.
// A tapback ("Loved "…"") always files on the number's latest request, or
// is dropped if they have none. A short text files as a reply only if we
// texted them within the window and they have an active request — otherwise
// it falls through and becomes a request like before.
//
// 'filed'   → saved to the thread; no ack, no team fan-out
// 'dropped' → a reaction with nowhere to go; save nothing, say nothing
// 'request' → not a reply after all; continue down the normal path
async function fileInbound(
  supabase: SupabaseClient,
  org: Org,
  from: string,
  text: string,
  kind: 'reaction' | 'candidate_reply',
  providerId: string | null
): Promise<'filed' | 'dropped' | 'request'> {
  const isReaction = kind === 'reaction'
  const outbound = await findRecentOutbound(supabase, {
    orgId: org.id,
    phone: from,
    withinHours: isReaction ? undefined : REPLY_WINDOW_HOURS,
  })
  if (!isReaction && !outbound) return 'request'

  const requestId = await resolveReplyTarget(supabase, {
    orgId: org.id,
    phone: from,
    outbound,
    activeOnly: !isReaction,
  })
  if (!requestId) return isReaction ? 'dropped' : 'request'

  const { error } = await supabase.from('inbound_messages').insert({
    org_id: org.id,
    request_id: requestId,
    phone: from,
    body: text,
    kind: isReaction ? 'reaction' : 'reply',
    provider_id: providerId,
  })
  // A duplicate SmsMessageSid is Twilio retrying a delivery we already
  // recorded — that's filed, not an error.
  if (error && error.code !== '23505') throw error

  // A written reply reaches the member whose text it answers. Reactions stay
  // quiet: they show as a heart in the thread, nothing more.
  if (!isReaction && !error && outbound?.profile_id) {
    const profileId = outbound.profile_id
    after(async () => {
      const { data } = await supabase
        .from('prayer_requests')
        .select('name')
        .eq('id', requestId)
        .maybeSingle()
      await notifyReply(
        { requestId, requesterName: (data?.name as string | null) ?? null, body: text, profileId },
        org
      )
    })
  }
  return 'filed'
}

// POST /api/sms — Twilio webhook for incoming SMS
export async function POST(req: NextRequest) {
  // Validate the request is genuinely from Twilio
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = process.env.TWILIO_WEBHOOK_URL ?? `https://${req.headers.get('host')}/api/sms`
  const formData = await req.formData()
  const params: Record<string, string> = {}
  formData.forEach((value, key) => { params[key] = value.toString() })

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    params
  )

  if (!isValid && process.env.NODE_ENV === 'production') {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const from = params['From']
  const to = params['To']
  const body = params['Body']

  if (!body?.trim() || !from) {
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const supabase = createServiceClient()

  // The number the requester texted identifies the church. An unknown To
  // means a number Twilio routes here that no org claims — record it and
  // return 200 so Twilio doesn't retry, but save nothing. A lookup FAILURE is
  // different: return 500 so Twilio retries the delivery instead of the text
  // being dropped over a transient database error.
  let org
  try {
    org = to ? await getOrgByTwilioPhone(supabase, to) : null
  } catch {
    return new NextResponse('Lookup failed', { status: 500 })
  }
  if (!org) {
    await logError('sms.unknown_number', new Error('No org for inbound number'), { to })
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // REMOVE is a custom data-deletion keyword promised in our privacy policy.
  // (STOP/HELP/UNSUBSCRIBE etc. are handled automatically by Twilio before
  // this webhook is ever called, so we only need to handle REMOVE ourselves.)
  // Scoped to this org: the same person may have texted another church.
  if (body.trim().toLowerCase() === 'remove') {
    const { error: deleteError } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('phone', from)
      .eq('org_id', org.id)

    if (deleteError) await logError('sms.remove_delete', deleteError, { from })

    try {
      await sendSms({
        body: `${org.name}: We've deleted your prayer request data from our records. Text us again anytime to share a new request.`,
        to: from,
        kind: 'sms.remove_confirm',
        from: org.twilio_phone,
        orgId: org.id,
      })
    } catch (err) {
      await logError('sms.remove_confirm', err, { from })
    }

    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const text = body.trim()

  // Is this an answer to something we sent, rather than a new request? A
  // failure inside the check must not lose the text: log it and treat the
  // message as a request, which is what would have happened before.
  const kind = classifyInbound(text)
  if (kind !== 'request') {
    const providerId = params['SmsMessageSid'] ?? params['MessageSid'] ?? null
    let outcome: 'filed' | 'dropped' | 'request' = 'request'
    try {
      outcome = await fileInbound(supabase, org, from, text, kind, providerId)
    } catch (err) {
      await logError('sms.file_inbound', err, { from, kind })
    }
    if (outcome !== 'request') return EMPTY_TWIML()
  }

  const { data: inserted, error } = await supabase
    .from('prayer_requests')
    .insert({
      phone: from,
      request: text,
      source: 'sms',
      notify_prayers: true,
      org_id: org.id,
    })
    .select('id')
    .single()

  // Only acknowledge if we actually saved the request — otherwise the sender
  // would be told "received" for something that was lost.
  if (error) {
    await logError('sms.ingest_insert', error, { from })
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Alert immediate-cadence team members (never the requester's phone number).
  after(() =>
    notifyNewRequest({ id: inserted?.id, name: null, request: text, source: 'sms' }, org)
  )

  try {
    await sendSms({
      body: `${org.name}: Thank you for your prayer request. Our prayer team has received it and will be praying for you. We'll let you know when people pray. Msg freq varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
      to: from,
      kind: 'sms.ack',
      from: org.twilio_phone,
      orgId: org.id,
      // Lets a reaction to the ack itself find its way back to this request.
      meta: inserted?.id ? { request_id: inserted.id } : undefined,
    })
  } catch (err) {
    await logError('sms.ack', err, { from })
  }

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
