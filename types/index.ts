export type PrayerRequest = {
  id: string
  name: string | null
  phone: string | null
  request: string
  is_anonymous: boolean
  is_approved: boolean
  created_at: string
}
