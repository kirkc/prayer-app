import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { logError } from '@/lib/log'

// DELETE /api/super/requesters — delete all of one requester's data by phone
// number, the same effect as them texting REMOVE. Super admin only. The phone
// travels in the JSON body, never in the URL.
export async function DELETE(req: NextRequest) {
  const user = await getSuperAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone } = await req.json().catch(() => ({}))
  if (typeof phone !== 'string' || !phone.startsWith('+')) {
    return NextResponse.json({ error: 'A phone number is required.' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error, count } = await service
    .from('prayer_requests')
    .delete({ count: 'exact' })
    .eq('phone', phone)

  if (error) {
    await logError('super.requester_delete', error)
    return NextResponse.json({ error: 'Could not delete their data.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, deleted: count ?? 0 })
}
