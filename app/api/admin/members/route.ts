import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgById } from '@/lib/orgs'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

// POST /api/admin/members — invite a new team member by email. Admin only.
// generateLink (type: 'invite') creates the user; the branded email is sent via
// Resend and its link lands on /set-password where the member chooses a password.
export async function POST(req: NextRequest) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName =
    typeof body.display_name === 'string' ? body.display_name.trim() : ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  // The invitee joins the inviting admin's church: org_id in the invite
  // metadata is what handle_new_user() reads when it creates their profile.
  const service = createServiceClient()
  const org = await getOrgById(service, admin.orgId)
  if (!org) {
    return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 })
  }

  // Always send invites to the deployed app's /set-password, never the request
  // origin (an admin on localhost was baking localhost into live links). This
  // URL must be allow-listed in Supabase (Authentication → URL Configuration).
  const { user, error } = await sendAuthEmail({
    type: 'invite',
    email,
    redirectBase: getSiteUrl(req),
    data: {
      org_id: org.id,
      ...(displayName ? { display_name: displayName } : {}),
    },
    orgName: org.name,
    orgId: org.id,
    meta: { invited_by: admin.user.id },
  })

  if (error || !user) {
    await logError('admin.invite', error ?? new Error('No user returned'), { recipient: email })
    // Surface the cause so admins aren't left guessing. A 429 here would be a
    // Resend rate limit; the message-already-registered case is common.
    const isRateLimit = error?.status === 429 || /rate limit/i.test(error?.message ?? '')
    const message = /already been registered|already registered/i.test(error?.message ?? '')
      ? 'That email already has an account.'
      : isRateLimit
        ? 'Email rate limit reached — please wait a few minutes and try again.'
        : 'Could not send the invite.'
    const status = isRateLimit ? 429 : 400
    return NextResponse.json({ error: message }, { status })
  }

  // The auth trigger has already created their profile row.
  return NextResponse.json(
    {
      member: {
        id: user.id,
        email: user.email,
        display_name: displayName || (user.email?.split('@')[0] ?? null),
        role: 'prayer',
      },
    },
    { status: 201 }
  )
}
