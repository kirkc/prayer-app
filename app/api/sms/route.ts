import { NextRequest, NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { sendSms } from '@/lib/twilio'
import { notifyNewRequest } from '@/lib/notifications'
import { getOrgByTwilioPhone } from '@/lib/orgs'
import { logError } from '@/lib/log'
import twilio from 'twilio'

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

  const { error } = await supabase
    .from('prayer_requests')
    .insert({
      phone: from,
      request: body.trim(),
      source: 'sms',
      notify_prayers: true,
      org_id: org.id,
    })

  // Only acknowledge if we actually saved the request — otherwise the sender
  // would be told "received" for something that was lost.
  if (error) {
    await logError('sms.ingest_insert', error, { from })
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  // Alert immediate-cadence team members (never the requester's phone number).
  after(() => notifyNewRequest({ name: null, request: body.trim(), source: 'sms' }, org))

  try {
    await sendSms({
      body: `${org.name}: Thank you for your prayer request. Our prayer team has received it and will be praying for you. We'll let you know when people pray. Msg freq varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
      to: from,
      kind: 'sms.ack',
      from: org.twilio_phone,
      orgId: org.id,
    })
  } catch (err) {
    await logError('sms.ack', err, { from })
  }

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
