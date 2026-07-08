import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { twilioClient, TWILIO_PHONE_NUMBER } from '@/lib/twilio'

type Params = { params: Promise<{ id: string }> }

// POST /api/prayers/[id]/respond — send a text reply to the requester.
// Responding is a form of care, so it also counts as praying and marks the
// request as replied.
export async function POST(req: NextRequest, { params }: Params) {
  // 1. Confirm the caller is a signed-in team member.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { body } = await req.json().catch(() => ({}))
  const message = typeof body === 'string' ? body.trim() : ''

  if (!message) {
    return NextResponse.json({ error: 'A response message is required.' }, { status: 400 })
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: 'Response is too long.' }, { status: 400 })
  }

  // 2. Look up the phone number server-side only (service role can read it).
  const service = createServiceClient()
  const { data: request, error: fetchError } = await service
    .from('prayer_requests')
    .select('id, phone, source')
    .eq('id', id)
    .single()

  if (fetchError || !request) {
    return NextResponse.json({ error: 'Prayer request not found.' }, { status: 404 })
  }
  if (request.source !== 'sms' || !request.phone) {
    return NextResponse.json(
      { error: 'This request has no phone number to reply to.' },
      { status: 400 }
    )
  }

  // 3. Send the outbound SMS.
  let twilioSid: string | null = null
  try {
    const sent = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: request.phone,
    })
    twilioSid = sent.sid
  } catch (err) {
    console.error('Twilio send error:', err)
    return NextResponse.json({ error: 'Could not send the text message.' }, { status: 502 })
  }

  // 4. Record the response, mark replied, and count it as a prayer.
  //    The SMS already went out, so DB errors here are logged but not fatal.
  const [{ error: responseError }, , { error: statusError }] = await Promise.all([
    service.from('prayer_responses').insert({
      request_id: id,
      profile_id: user.id,
      body: message,
      twilio_message_sid: twilioSid,
      status: 'sent',
    }),
    service.from('prayers').upsert(
      { request_id: id, profile_id: user.id },
      { onConflict: 'request_id,profile_id', ignoreDuplicates: true }
    ),
    service.from('prayer_requests').update({ replied: true }).eq('id', id),
  ])

  if (responseError) console.error('Response insert error:', responseError)
  if (statusError) console.error('Replied-status update error:', statusError)

  const { data: updated } = await service
    .from('prayer_requests')
    .select('prayed_count')
    .eq('id', id)
    .single()

  return NextResponse.json({
    success: true,
    replied: true,
    you_prayed: true,
    prayed_count: updated?.prayed_count ?? 0,
  })
}
