export type NotifyFrequency = 'immediate' | 'daily' | 'weekly'

export type Profile = {
  id: string
  display_name: string | null
  role: 'prayer' | 'admin' | 'super_admin'
  created_at: string
  notify_new_requests: boolean
  notify_frequency: NotifyFrequency
  notify_last_sent_at: string | null
}

// Shape returned to the dashboard client. Note: `phone` is intentionally
// absent — it is never sent to the browser (see migration 002 column grants);
// `has_phone` exposes only whether a text reply is possible.
export type PrayerRequest = {
  id: string
  name: string | null
  request: string
  source: 'web' | 'sms'
  status: 'active' | 'archived' | 'spam'
  replied: boolean
  prayed_count: number
  created_at: string
  has_phone: boolean
}

// A prayer request plus per-viewer state for the current signed-in user.
export type PrayerRequestWithState = PrayerRequest & {
  you_prayed: boolean
}

export type PrayerResponse = {
  id: string
  request_id: string
  profile_id: string | null
  body: string
  sent_at: string
  twilio_message_sid: string | null
  status: string | null
}

// --- Operations tables (service-role only; surfaced at /admin/ops) ---

export type AppError = {
  id: string
  created_at: string
  scope: string
  message: string
  detail: Record<string, unknown> | null
  resolved_at: string | null
  resolved_by: string | null
}

export type MessageStatus =
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'
  | 'bounced'
  | 'complained'
  | 'delayed'

export type MessageLogEntry = {
  id: string
  created_at: string
  channel: 'sms' | 'email'
  kind: string
  recipient: string
  subject: string | null
  body_preview: string | null
  status: MessageStatus
  provider_id: string | null
  error_code: string | null
  error_message: string | null
  status_updated_at: string | null
  meta: Record<string, unknown> | null
}

export type CronJobName = 'notifications' | 'prayer-updates'

export type CronRun = {
  id: string
  job: CronJobName
  trigger: 'cron' | 'manual'
  started_at: string
  finished_at: string | null
  ok: boolean | null
  summary: Record<string, unknown> | null
  triggered_by: string | null
}
