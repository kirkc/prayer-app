import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { twilioClient, TWILIO_PHONE_NUMBER } from '@/lib/twilio'

// POST /api/sms - Twilio webhook for incoming SMS
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const from = formData.get('From') as string
  const body = formData.get('Body') as string

  if (!body || !from) {
    return new NextResponse('Missing fields', { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('prayer_requests')
    .insert({ phone: from, request: body.trim(), is_anonymous: false })

  if (error) {
    console.error('Supabase insert error:', error)
  }

  // Reply to sender via SMS
  await twilioClient.messages.create({
    body: 'Thank you for your prayer request. We will be praying for you!',
    from: TWILIO_PHONE_NUMBER,
    to: from,
  })

  // Return empty TwiML response
  return new NextResponse('<Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  })
}
