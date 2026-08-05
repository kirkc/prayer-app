// Normalize a user-entered US phone number to E.164 (+1XXXXXXXXXX) for Twilio.
// Returns null if it isn't a plausible 10-digit US number, so callers can
// reject bad input rather than storing something un-textable.
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// E.164 US number → the friendly display form used on public pages,
// e.g. +12068886649 → (206) 888-6649. Non-US shapes fall back unchanged.
export function formatPhoneDisplay(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}
