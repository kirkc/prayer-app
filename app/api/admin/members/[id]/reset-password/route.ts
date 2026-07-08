import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

// POST /api/admin/members/[id]/reset-password — email a password-reset link
// to a team member. Admin only.
export async function POST(req: NextRequest, { params }: Params) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()

  const { data, error: lookupError } = await service.auth.admin.getUserById(id)
  if (lookupError || !data.user?.email) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  // The link lands on /set-password; the origin must be allow-listed in
  // Supabase (Authentication → URL Configuration).
  const redirectTo = `${req.nextUrl.origin}/set-password`

  const { error } = await service.auth.resetPasswordForEmail(data.user.email, {
    redirectTo,
  })

  if (error) {
    console.error('Password reset error:', error)
    return NextResponse.json(
      { error: 'Could not send the reset email.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ success: true })
}
