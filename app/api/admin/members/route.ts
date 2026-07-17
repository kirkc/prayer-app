import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getSiteUrl } from '@/lib/site-url'
import { logError, logMessage } from '@/lib/log'

// POST /api/admin/members — invite a new team member by email. Admin only.
// Sends a Supabase invite email; the link lands on /set-password where the
// new member chooses their password.
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName =
    typeof body.display_name === 'string' ? body.display_name.trim() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  // Always send invites to the deployed app's /set-password, never the request
  // origin (an admin on localhost was baking localhost into live links). This
  // URL must be allow-listed in Supabase (Authentication → URL Configuration).
  const redirectTo = `${getSiteUrl(req)}/set-password`

  const service = createServiceClient()
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: displayName ? { display_name: displayName } : undefined,
  })

  // The invite email goes out through Supabase Auth SMTP (Resend under the
  // hood), so the app only sees the API call result here; the Resend webhook
  // fills in delivery status later by matching the recipient.
  await logMessage({
    channel: 'email',
    kind: 'auth.invite',
    recipient: email,
    subject: 'Team invite',
    status: error ? 'failed' : 'sent',
    errorMessage: error?.message,
    meta: { invited_by: admin.id },
  })

  if (error) {
    await logError('admin.invite', error, { recipient: email })
    // Surface the cause so admins aren't left guessing. The 429 here is
    // Supabase's built-in email rate limit — a sign a custom SMTP provider
    // is needed for real onboarding (Authentication → SMTP Settings).
    const isRateLimit =
      error.status === 429 || /rate limit/i.test(error.message)
    const message = error.message.includes('already been registered')
      ? 'That email already has an account.'
      : isRateLimit
        ? 'Email rate limit reached. Set up a custom SMTP provider in Supabase to send invites reliably.'
        : 'Could not send the invite.'
    const status = isRateLimit ? 429 : 400
    return NextResponse.json({ error: message }, { status })
  }

  // The auth trigger has already created their profile row.
  return NextResponse.json(
    {
      member: {
        id: data.user.id,
        email: data.user.email,
        display_name: displayName || (data.user.email?.split('@')[0] ?? null),
        role: 'prayer',
      },
    },
    { status: 201 }
  )
}
