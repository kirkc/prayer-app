import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { twilioClient, TWILIO_PHONE_NUMBER } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

// Vercel Cron hits this once a day in the evening (see vercel.json). For each
// requester who opted into "someone prayed for you" updates, count the prayers
// since we last texted them and, if there are any, send a single recap. The
// daily cadence caps it at one text per day; the count check means we only text
// when something actually happened.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const runAt = new Date()

  const { data: requests, error } = await service
    .from('prayer_requests')
    .select('id, phone, created_at, prayers_notified_at')
    .eq('notify_prayers', true)
    .eq('status', 'active')
    .not('phone', 'is', null)
  if (error) {
    console.error('prayer-updates query error:', error)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  let sent = 0
  for (const r of requests ?? []) {
    const since = (r.prayers_notified_at as string | null) ?? (r.created_at as string)

    const { count, error: countError } = await service
      .from('prayers')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', r.id)
      .gt('prayed_at', since)
      .lte('prayed_at', runAt.toISOString())
    if (countError) {
      console.error(`prayer count failed for ${r.id}:`, countError)
      continue
    }

    const n = count ?? 0
    if (n === 0) continue // nothing new — don't text, don't advance the cursor

    // Warm, tiered wording — at the low counts these usually are, the number
    // recedes and "someone" feels more personal than "1 person."
    const lead =
      n === 1 ? 'Someone prayed for you today.'
      : n === 2 ? 'A couple people prayed for you today.'
      : `${n} people prayed for you today.`
    // "Grace and peace to you" — Romans 1:7 / 1 Cor 1:3 / 2 Cor 1:2. Kept verbatim.
    const core = `${lead} Grace and peace to you.`

    // The first update someone gets carries who it's from + how to opt out
    // (compliance); every one after that stays bare so it reads like a friend
    // checking in. `prayers_notified_at == null` means we've never texted them.
    const isFirst = r.prayers_notified_at == null
    const body = isFirst
      ? `${core} —Redemption Church Seattle. Reply STOP to pause.`
      : core

    try {
      await twilioClient.messages.create({
        body,
        from: TWILIO_PHONE_NUMBER,
        to: r.phone as string,
      })
      sent++
    } catch (err) {
      console.error(`prayer-update SMS failed for ${r.id}:`, err)
      continue // leave the cursor so it retries tomorrow
    }

    await service
      .from('prayer_requests')
      .update({ prayers_notified_at: runAt.toISOString() })
      .eq('id', r.id)
  }

  return NextResponse.json({ ok: true, sent })
}
