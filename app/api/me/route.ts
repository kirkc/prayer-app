import { NextRequest, NextResponse } from 'next/server'
import { getApiMemberContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgById } from '@/lib/orgs'
import { logError } from '@/lib/log'

// GET /api/me — who am I, and which church am I serving? The iOS app calls
// this after sign-in: sms_enabled drives whether Respond ever appears, and
// role gates nothing yet on mobile (admin stays web-only) but is cheap to
// include for later.
export async function GET(req: NextRequest) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', member.user.id)
    .single()

  const org = await getOrgById(service, member.orgId).catch(() => null)
  if (!org) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    id: member.user.id,
    email: member.user.email,
    display_name: profile?.display_name ?? null,
    role: member.role,
    org: {
      name: org.name,
      slug: org.slug,
      sms_enabled: org.twilio_phone !== null,
    },
  })
}

// DELETE /api/me — the caller deletes their own account. The App Store expects
// an account to be removable from inside the app, so this has to answer to a
// Bearer token as well as a cookie session; getApiMemberContext does both.
//
// Deleting the auth user is enough: the profile cascades, and with it their
// device tokens and prayer records (counts adjust by trigger). Replies they
// already sent stay, with the author nulled — same shape as an admin removing
// a member.
export async function DELETE(req: NextRequest) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The operations tier isn't a church membership — losing it locks everyone
  // out of the error log and cron controls with no way back through the UI.
  if (member.role === 'super_admin') {
    return NextResponse.json(
      { error: "This account can't be deleted here." },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  // A church with no admin has nobody who can invite anyone — it would be
  // stranded. Make the last one hand off first.
  if (member.role === 'admin') {
    const { count, error: countError } = await service
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', member.orgId)
      .in('role', ['admin', 'super_admin'])

    if (countError) {
      await logError('me.delete', countError, { profile_id: member.user.id })
      return NextResponse.json({ error: 'Could not delete your account.' }, { status: 500 })
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error:
            'You are the only administrator for your church. Make someone else an administrator first, then delete your account.',
        },
        { status: 400 }
      )
    }
  }

  const { error } = await service.auth.admin.deleteUser(member.user.id)
  if (error) {
    await logError('me.delete', error, { profile_id: member.user.id })
    return NextResponse.json({ error: 'Could not delete your account.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
