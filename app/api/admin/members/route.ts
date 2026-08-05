import { NextRequest, NextResponse } from 'next/server'
import { getAdminContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgById, getOrgBySlug } from '@/lib/orgs'
import { sendAuthEmail } from '@/lib/auth-email'
import { getSiteUrl } from '@/lib/site-url'
import { logError } from '@/lib/log'

// POST /api/admin/members — invite a new team member by email. Admin only.
// The account is pre-created with the invite marker; the branded email is sent
// via Resend and its link lands on /set-password where the member chooses a
// password.
//
// The super admin may additionally pass { org_slug, role } to seed another
// church's first admin — the only way a new org gets its first member.
export async function POST(req: NextRequest) {
  const admin = await getAdminContext()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName =
    typeof body.display_name === 'string' ? body.display_name.trim() : ''
  const orgSlug = typeof body.org_slug === 'string' ? body.org_slug.trim() : ''
  const role: 'prayer' | 'admin' = body.role === 'admin' ? 'admin' : 'prayer'

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }
  if ((orgSlug || body.role) && admin.role !== 'super_admin') {
    return NextResponse.json(
      { error: 'Only the operator can set a church or role on an invite.' },
      { status: 403 }
    )
  }

  // The invitee joins the inviting admin's church (or, for the super admin,
  // the named one): org_id in the invite metadata is what the profile trigger
  // reads when it creates their profile.
  const service = createServiceClient()
  const org = orgSlug
    ? await getOrgBySlug(service, orgSlug)
    : await getOrgById(service, admin.orgId)
  if (!org) {
    const status = orgSlug ? 404 : 500
    return NextResponse.json(
      { error: orgSlug ? 'No church with that slug.' : 'Could not send the invite.' },
      { status }
    )
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

  // The auth trigger has already created their profile row (role 'prayer').
  // Seeding another church's first admin needs the elevated role applied.
  if (role === 'admin') {
    const { error: roleError } = await service
      .from('profiles')
      .update({ role })
      .eq('id', user.id)
    if (roleError) {
      await logError('admin.invite_role', roleError, { target_id: user.id, role })
    }
  }

  return NextResponse.json(
    {
      member: {
        id: user.id,
        email: user.email,
        display_name: displayName || (user.email?.split('@')[0] ?? null),
        role,
      },
    },
    { status: 201 }
  )
}
