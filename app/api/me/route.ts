import { NextRequest, NextResponse } from 'next/server'
import { getApiMemberContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgById } from '@/lib/orgs'

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
