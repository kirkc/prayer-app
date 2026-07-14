export type NotifyFrequency = 'immediate' | 'daily' | 'weekly'

export type Profile = {
  id: string
  display_name: string | null
  role: 'prayer' | 'admin'
  created_at: string
  notify_new_requests: boolean
  notify_frequency: NotifyFrequency
  notify_last_sent_at: string | null
}

// Shape returned to the dashboard client. Note: `phone` is intentionally
// absent — it is never sent to the browser (see migration 002 column grants).
export type PrayerRequest = {
  id: string
  name: string | null
  request: string
  source: 'web' | 'sms'
  status: 'active' | 'archived' | 'spam'
  replied: boolean
  prayed_count: number
  created_at: string
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
