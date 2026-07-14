import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  getEligibleRecipients,
  sendDigestEmail,
  type NewRequestSummary,
} from '@/lib/notifications'

export const dynamic = 'force-dynamic'

// Vercel Cron hits this daily (see vercel.json). A single daily run drives both
// cadences: 'daily' users always, 'weekly' users only on the chosen weekday.
const WEEKLY_SEND_DOW = 1 // Monday, in UTC

const WINDOW_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const runAt = new Date()

  // Same for every recipient — compute once for the summary line.
  const { count } = await service
    .from('prayer_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')
  const activeTotal = count ?? 0

  const periods: ('daily' | 'weekly')[] = ['daily']
  if (runAt.getUTCDay() === WEEKLY_SEND_DOW) periods.push('weekly')

  let sent = 0
  for (const period of periods) {
    const recipients = await getEligibleRecipients(period)
    for (const r of recipients) {
      // Window = everything since we last processed this member, or one period
      // back if they've never received a digest.
      const since = r.notify_last_sent_at
        ? new Date(r.notify_last_sent_at)
        : new Date(runAt.getTime() - WINDOW_MS[period])

      const { data: rows, error } = await service
        .from('prayer_requests')
        .select('name, request, source, created_at')
        .neq('status', 'spam')
        .gt('created_at', since.toISOString())
        .lte('created_at', runAt.toISOString())
        .order('created_at', { ascending: true })
      if (error) {
        console.error(`Digest query failed for ${r.email}:`, error)
        continue // leave the cursor so it retries next run
      }

      const requests = (rows ?? []) as NewRequestSummary[]
      if (requests.length > 0) {
        try {
          await sendDigestEmail(r, requests, { period, activeTotal })
          sent++
        } catch (err) {
          console.error(`Digest send failed for ${r.email}:`, err)
          continue // don't advance the cursor — retry the same window next run
        }
      }

      // Advance the cursor after a successful send (or when there was nothing
      // to send) so windows stay aligned to the cadence.
      await service
        .from('profiles')
        .update({ notify_last_sent_at: runAt.toISOString() })
        .eq('id', r.id)
    }
  }

  return NextResponse.json({ ok: true, sent, periods })
}
