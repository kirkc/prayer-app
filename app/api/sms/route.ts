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
  const { error } = await supabase
    .from('prayer_requests')
    .insert({ phone: from, request: body.trim(), source: 'sms' })

  if (error) console.error('Supabase insert error:', error)

  await twilioClient.messages.create({
    body: 'Thank you for your prayer request. We will be praying for you.',
    from: TWILIO_PHONE_NUMBER,
    to: from,
  })

  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
