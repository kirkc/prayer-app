import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'

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

  // Send the invite from the same origin the admin is using, so local dev and
  // production each land on their own /set-password page. The origin must be
  // allow-listed in Supabase (Authentication → URL Configuration).
  const redirectTo = `${req.nextUrl.origin}/set-password`

  const service = createServiceClient()
  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: displayName ? { display_name: displayName } : undefined,
  })

  if (error) {
    console.error('Invite error:', error)
    const message = error.message.includes('already been registered')
      ? 'That email already has an account.'
      : 'Could not send the invite.'
    return NextResponse.json({ error: message }, { status: 400 })
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
