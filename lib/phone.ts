// Normalize a user-entered US phone number to E.164 (+1XXXXXXXXXX) for Twilio.
// Returns null if it isn't a plausible 10-digit US number, so callers can
// reject bad input rather than storing something un-textable.
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}
