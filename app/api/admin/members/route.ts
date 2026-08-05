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

  // Create the account first, with an app_metadata invite marker. Public
  // signup can set user_metadata but never app_metadata, so the profile
  // trigger can require this marker to enforce invite-only membership at the
  // database — even if someone hits the auth signup endpoint directly with
  // the anon key.
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { invited: true },
    user_metadata: {
      org_id: org.id,
      ...(displayName ? { display_name: displayName } : {}),
    },
  })

  if (createError || !created?.user) {
    await logError('admin.invite', createError ?? new Error('No user returned'), { recipient: email })
    const message = /already been registered|already registered/i.test(createError?.message ?? '')
      ? 'That email already has an account.'
      : 'Could not send the invite.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const user = created.user

  // Always send invites to the deployed app's /set-password, never the request
  // origin (an admin on localhost was baking localhost into live links). This
  // URL must be allow-listed in Supabase (Authentication → URL Configuration).
  // The account already exists, so the link is a recovery ("choose your
  // password") link dressed in the invite copy.
  const { error } = await sendAuthEmail({
    type: 'invite',
    linkType: 'recovery',
    email,
    redirectBase: getSiteUrl(req),
    org,
    meta: { invited_by: admin.user.id },
  })

  if (error) {
    // Undo the account so the admin's retry doesn't hit "already registered".
    await service.auth.admin.deleteUser(user.id)
    await logError('admin.invite', error, { recipient: email })
    const isRateLimit = error.status === 429 || /rate limit/i.test(error.message ?? '')
    const message = isRateLimit
      ? 'Email rate limit reached — please wait a few minutes and try again.'
      : 'Could not send the invite.'
    return NextResponse.json({ error: message }, { status: isRateLimit ? 429 : 400 })
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
