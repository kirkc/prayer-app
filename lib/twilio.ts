import twilio, { Twilio } from 'twilio'

let client: Twilio | null = null

// Lazily construct the Twilio client so importing this module during
// `next build` (when env vars may be absent) doesn't throw.
function getClient(): Twilio {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  }
  return client
}

// Proxy so existing `twilioClient.messages.create(...)` call sites keep working
// while construction stays deferred until first use.
export const twilioClient = {
  get messages() {
    return getClient().messages
  },
}

export const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER!
