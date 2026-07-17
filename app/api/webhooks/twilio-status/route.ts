import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'
import twilio from 'twilio'

// POST /api/webhooks/twilio-status — Twilio per-message status callback.
// Every outbound SMS sent through lib/twilio.ts sendSms() names this URL, so
// delivery outcomes (delivered / undelivered / failed + error code) land in
// message_log instead of living only in the Twilio console.
export async function POST(req: NextRequest) {
  // Validate the request is genuinely from Twilio (same pattern as /api/sms).
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url =
    process.env.TWILIO_STATUS_CALLBACK_URL ??
    `https://${req.headers.get('host')}/api/webhooks/twilio-status`
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

  const sid = params['MessageSid']
  const status = params['MessageStatus']
  const errorCode = params['ErrorCode']

  // Twilio reports intermediate states (queued, sending) too — only the
  // meaningful ones are worth a write.
  const TRACKED = ['sent', 'delivered', 'undelivered', 'failed']
  if (!sid || !TRACKED.includes(status)) {
    return new NextResponse(null, { status: 204 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('message_log')
    .update({
      status,
      error_code: errorCode ?? null,
      status_updated_at: new Date().toISOString(),
    })
    .eq('provider_id', sid)
  if (error) await logError('webhook.twilio_status', error, { sid, status })

  // Team replies also track status on the response record itself.
  await service
    .from('prayer_responses')
    .update({ status })
    .eq('twilio_message_sid', sid)

  return new NextResponse(null, { status: 204 })
}
