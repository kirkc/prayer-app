import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { twilioClient, TWILIO_PHONE_NUMBER } from '@/lib/twilio'
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
  const body = params['Body']

  if (!body?.trim() || !from) {
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const supabase = createServiceClient()

  // REMOVE is a custom data-deletion keyword promised in our privacy policy.
  // (STOP/HELP/UNSUBSCRIBE etc. are handled automatically by Twilio before
  // this webhook is ever called, so we only need to handle REMOVE ourselves.)
  if (body.trim().toLowerCase() === 'remove') {
    const { error: deleteError } = await supabase
      .from('prayer_requests')
      .delete()
      .eq('phone', from)

    if (deleteError) console.error('Remove-data delete error:', deleteError)

    try {
      await twilioClient.messages.create({
        body: "Redemption Church Seattle: We've deleted your prayer request data from our records. Text us again anytime to share a new request.",
        from: TWILIO_PHONE_NUMBER,
        to: from,
      })
    } catch (err) {
      console.error('Twilio remove-confirmation error:', err)
    }

    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const { error } = await supabase
    .from('prayer_requests')
    .insert({ phone: from, request: body.trim(), source: 'sms' })

  // Only acknowledge if we actually saved the request — otherwise the sender
  // would be told "received" for something that was lost.
  if (error) {
    console.error('Supabase insert error:', error)
    return new NextResponse('<Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  try {
    await twilioClient.messages.create({
      body: 'Redemption Church Seattle: Thank you for your prayer request. Our prayer team has received it and will be praying for you. Msg freq varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
      from: TWILIO_PHONE_NUMBER,
      to: from,
    })
  } catch (err) {
    console.error('Twilio acknowledgment error:', err)
  }

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
