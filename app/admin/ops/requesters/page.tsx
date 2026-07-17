import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import RequesterList, { type Requester } from '@/components/ops/RequesterList'

export const dynamic = 'force-dynamic'

export default async function RequestersPage() {
  const user = await getSuperAdminUser()
  if (!user) redirect('/admin')

  // Phone numbers are readable only by the service role (migration 002) and
  // only ever rendered here, on a super-admin-gated page.
  const service = createServiceClient()
  const { data } = await service
    .from('prayer_requests')
    .select('phone, notify_prayers, created_at')
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })

  const byPhone = new Map<string, Requester>()
  for (const row of data ?? []) {
    const phone = row.phone as string
    const existing = byPhone.get(phone)
    if (existing) {
      existing.requestCount++
      // Rows arrive newest-first, so the first row already set latestAt.
      existing.notifyPrayers = existing.notifyPrayers || row.notify_prayers === true
    } else {
      byPhone.set(phone, {
        phone,
        requestCount: 1,
        latestAt: row.created_at as string,
        notifyPrayers: row.notify_prayers === true,
      })
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-8 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Requesters</h1>
            <p className="text-sm text-ink-400 mt-1.5">
              People who texted in, and their notification choices
            </p>
          </div>
          <Link
            href="/admin/ops"
            className="text-sm text-ink-400 hover:text-ink-600 transition-colors duration-300"
          >
            Back to operations
          </Link>
        </div>

        <div className="animate-rise" style={{ animationDelay: '0.05s' }}>
          <RequesterList requesters={[...byPhone.values()]} />
          <p className="text-xs text-ink-300 mt-3 leading-relaxed">
            Phone numbers never leave this page. Deleting someone&apos;s data removes all
            their prayer requests — the same as if they texted REMOVE.
          </p>
        </div>
      </div>
    </main>
  )
}
