import { createServiceClient } from '@/lib/supabase-server'
import { sendSms } from '@/lib/twilio'
import { logError } from '@/lib/log'
import {
  getEligibleRecipients,
  sendDigestEmail,
  type NewRequestSummary,
} from '@/lib/notifications'
import type { CronJobName } from '@/types'

// The scheduled-job bodies, extracted from the cron route handlers so the
// super-admin "Run now" button and Vercel Cron share one implementation.
// runCronJob() wraps either job with a cron_runs record for the ops dashboard.

export type CronSummary = Record<string, unknown>

// A single daily run drives both digest cadences: 'daily' users always,
// 'weekly' users only on the chosen weekday. Saturday (getUTCDay() → 6). The
// daily cron fires at 15:00 UTC (~8am Pacific), so weekly digests land
// Saturday morning — ready for the team before Sunday.
const WEEKLY_SEND_DOW = 6

const WINDOW_MS = { daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 }

export async function runNotificationsJob(): Promise<CronSummary> {
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
  let errors = 0
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
        await logError('cron.notifications.digest_query', error, { recipient: r.email })
        errors++
        continue // leave the cursor so it retries next run
      }

      const requests = (rows ?? []) as NewRequestSummary[]
      if (requests.length > 0) {
        try {
          await sendDigestEmail(r, requests, { period, activeTotal })
          sent++
        } catch (err) {
          await logError('cron.notifications.digest_send', err, { recipient: r.email })
          errors++
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

  return { sent, errors, periods }
}

// For each requester who opted into "someone prayed for you" updates, count
// the prayers since we last texted them and, if there are any, send a single
// recap. The daily cadence caps it at one text per day; the count check means
// we only text when something actually happened.
export async function runPrayerUpdatesJob(): Promise<CronSummary> {
  const service = createServiceClient()
  const runAt = new Date()

  const { data: requests, error } = await service
    .from('prayer_requests')
    .select('id, phone, created_at, prayers_notified_at')
    .eq('notify_prayers', true)
    .eq('status', 'active')
    .not('phone', 'is', null)
  if (error) {
    await logError('cron.prayer_updates.query', error)
    throw new Error('prayer-updates query failed')
  }

  let sent = 0
  let errors = 0
  for (const r of requests ?? []) {
    const since = (r.prayers_notified_at as string | null) ?? (r.created_at as string)

    const { count, error: countError } = await service
      .from('prayers')
      .select('*', { count: 'exact', head: true })
      .eq('request_id', r.id)
      .gt('prayed_at', since)
      .lte('prayed_at', runAt.toISOString())
    if (countError) {
      await logError('cron.prayer_updates.count', countError, { request_id: r.id })
      errors++
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
      await sendSms({
        body,
        to: r.phone as string,
        kind: 'sms.prayer_update',
        meta: { request_id: r.id },
      })
      sent++
    } catch (err) {
      await logError('cron.prayer_updates.sms', err, { request_id: r.id })
      errors++
      continue // leave the cursor so it retries tomorrow
    }

    await service
      .from('prayer_requests')
      .update({ prayers_notified_at: runAt.toISOString() })
      .eq('id', r.id)
  }

  return { sent, errors }
}

const JOBS: Record<CronJobName, () => Promise<CronSummary>> = {
  notifications: runNotificationsJob,
  'prayer-updates': runPrayerUpdatesJob,
}

// Runs a job and records the run in cron_runs, whether triggered by Vercel
// Cron or the super-admin "Run now" button. Rethrows job failures after
// recording them so callers can return an error response.
export async function runCronJob(
  job: CronJobName,
  trigger: 'cron' | 'manual',
  triggeredBy?: string
): Promise<CronSummary> {
  const service = createServiceClient()
  const { data: run } = await service
    .from('cron_runs')
    .insert({ job, trigger, triggered_by: triggeredBy ?? null })
    .select('id')
    .single()

  const finish = async (ok: boolean, summary: CronSummary) => {
    if (!run) return
    await service
      .from('cron_runs')
      .update({ finished_at: new Date().toISOString(), ok, summary })
      .eq('id', run.id)
  }

  try {
    const summary = await JOBS[job]()
    await finish(summary.errors === 0 || !summary.errors, summary)
    return summary
  } catch (err) {
    await finish(false, { error: err instanceof Error ? err.message : String(err) })
    await logError(`cron.${job}`, err, { trigger })
    throw err
  }
}
