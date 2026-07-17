import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import { sendSms } from '@/lib/twilio'
import { logError } from '@/lib/log'

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
    .select('id, phone, source, replied, prayers_notified_at')
    .eq('id', id)
    .single()

  if (fetchError || !request) {
    return NextResponse.json({ error: 'Prayer request not found.' }, { status: 404 })
  }
  if (!request.phone) {
    return NextResponse.json(
      { error: 'This request has no phone number to reply to.' },
      { status: 400 }
    )
  }

  // An SMS requester texted us first, so replies land in a thread they
  // started. A web requester has never seen our number — if this is the
  // first text we've ever sent them for this request (no reply yet, no
  // prayer-update yet), identify who it's from.
  const isFirstContact =
    request.source === 'web' && !request.replied && request.prayers_notified_at == null
  const smsBody = isFirstContact ? `Redemption Church Seattle: ${message}` : message

  // 3. Send the outbound SMS.
  let twilioSid: string | null = null
  try {
    const sent = await sendSms({
      body: smsBody,
      to: request.phone,
      kind: 'sms.reply',
      meta: { request_id: id, profile_id: user.id },
    })
    twilioSid = sent.sid
  } catch (err) {
    await logError('respond.sms_send', err, { request_id: id, profile_id: user.id })
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

  // The SMS went out but our record of it failed — the ops log is the only
  // place this becomes visible.
  if (responseError) {
    await logError('respond.record_write', responseError, {
      request_id: id,
      profile_id: user.id,
      twilio_message_sid: twilioSid,
    })
  }
  if (statusError) {
    await logError('respond.replied_update', statusError, { request_id: id })
  }

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
