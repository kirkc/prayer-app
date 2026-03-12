export type PrayerRequest = {
  id: string
  name: string | null
  phone: string | null
  request: string
  source: 'web' | 'sms'
  status: 'active' | 'archived' | 'spam'
  created_at: string
}
