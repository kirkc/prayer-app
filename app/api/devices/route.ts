import { NextRequest, NextResponse } from 'next/server'
import { getApiMemberContext } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

// POST /api/devices — register (or refresh) the caller's APNs device token.
// Called by the iOS app after the user grants notification permission and on
// every launch, so last_seen_at doubles as a liveness marker.
export async function POST(req: NextRequest) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : ''
  const environment = body.environment === 'production' ? 'production' : 'sandbox'

  // Apple documents tokens as opaque and variable-length (physical devices
  // send 32 bytes, simulators 80) — validate the shape, not a fixed size.
  if (!/^[0-9a-f]{32,512}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid device token.' }, { status: 400 })
  }

  // Upsert on the token: a device that changes hands (sign out → different
  // member signs in) must follow its current user.
  const service = createServiceClient()
  const { error } = await service.from('device_tokens').upsert(
    {
      token,
      profile_id: member.user.id,
      environment,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  )

  if (error) {
    await logError('devices.register', error, { profile_id: member.user.id })
    return NextResponse.json({ error: 'Could not register the device.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// DELETE /api/devices — forget a token (sign-out).
export async function DELETE(req: NextRequest) {
  const member = await getApiMemberContext(req)
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token.trim().toLowerCase() : ''
  if (!token) return NextResponse.json({ error: 'A token is required.' }, { status: 400 })

  const service = createServiceClient()
  await service
    .from('device_tokens')
    .delete()
    .eq('token', token)
    .eq('profile_id', member.user.id)

  return NextResponse.json({ success: true })
}
