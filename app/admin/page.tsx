import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/admin'
import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase-server'
import TeamList, { Member } from '@/components/TeamList'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/dashboard')

  const supabase = await createServerSupabaseClient()
  const service = createServiceClient()

  const [
    { data: statsData },
    { data: profiles },
    { data: authUsers },
    { data: responses },
  ] = await Promise.all([
    // One cheap call returns every ministry number (all counts over small
    // tables, computed server-side in a single round trip).
    service.rpc('admin_dashboard_stats'),
    supabase
      .from('profiles')
      .select('id, display_name, role, created_at, notify_new_requests, notify_frequency')
      .order('created_at'),
    service.auth.admin.listUsers(),
    supabase
      .from('prayer_responses')
      .select('id, body, sent_at, profiles(display_name), prayer_requests(request)')
      .order('sent_at', { ascending: false })
      .limit(10),
  ])

  const emailById = new Map(
    (authUsers?.users ?? []).map(u => [u.id, u.email ?? ''])
  )
  const members: Member[] = (profiles ?? []).map(p => ({
    id: p.id,
    display_name: p.display_name,
    role: p.role,
    email: emailById.get(p.id) ?? '',
    notify_new_requests: p.notify_new_requests,
    notify_frequency: p.notify_frequency,
  }))

  const isSuperAdmin =
    (profiles ?? []).find(p => p.id === admin.id)?.role === 'super_admin'

  const s = (statsData ?? {}) as Record<string, number>
  const fmt = (v: number | undefined) => (v ?? 0).toLocaleString('en-US')
  const recentStats = [
    { label: 'Requests', value: s.recent_requests ?? 0 },
    { label: 'Prayers', value: s.recent_prayers ?? 0 },
    { label: 'Replies', value: s.recent_replies ?? 0 },
  ]

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Admin</h1>
            <p className="text-sm text-ink-400 mt-1.5">A quiet look at the whole picture</p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            {isSuperAdmin && (
              <Link
                href="/admin/ops"
                className="text-ink-400 hover:text-ink-600 transition-colors duration-300"
              >
                Operations
              </Link>
            )}
            <Link
              href="/dashboard"
              className="text-ink-400 hover:text-ink-600 transition-colors duration-300"
            >
              Back to requests
            </Link>
          </div>
        </div>

        {/* Overview — the last 30 days, with quiet lifetime + personal notes */}
        <div className="mb-10 animate-rise" style={{ animationDelay: '0.05s' }}>
          <p className="text-xs tracking-[0.15em] uppercase text-ink-300 mb-3">
            The last 30 days
          </p>
          <div className="grid grid-cols-3 gap-3">
            {recentStats.map(stat => (
              <div key={stat.label} className="card p-5 text-center">
                <p className="font-display text-3xl font-light text-ink-800">{fmt(stat.value)}</p>
                <p className="text-xs text-ink-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-400 mt-5 leading-relaxed">
            To date: <span className="text-ink-600">{fmt(s.total_requests)}</span> prayer requests
            · <span className="text-ink-600">{fmt(s.total_people)}</span> people prayed for
            · <span className="text-ink-600">{fmt(s.total_replies)}</span> replies sent
          </p>
        </div>

        {/* Team */}
        <section className="mb-10 animate-rise" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Prayer team</h2>
          <TeamList members={members} currentUserId={admin.id} superAdmin={isSuperAdmin} />
          <p className="text-xs text-ink-300 mt-3 leading-relaxed">
            Invited members receive an email link to choose their password.
            New members start with the Team role.
          </p>
        </section>

        {/* Recent replies */}
        <section className="animate-rise" style={{ animationDelay: '0.15s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Recent replies</h2>
          {(responses ?? []).length === 0 ? (
            <p className="text-sm text-ink-300 py-6 text-center">No replies sent yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {(responses ?? []).map(r => {
                const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
                const request = Array.isArray(r.prayer_requests) ? r.prayer_requests[0] : r.prayer_requests
                return (
                  <div key={r.id} className="card p-5">
                    <div className="flex items-baseline justify-between gap-4 mb-2">
                      <span className="text-xs text-ink-400">
                        {profile?.display_name ?? 'Team member'} replied
                      </span>
                      <span className="text-xs text-ink-300 shrink-0">
                        {new Date(r.sent_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-ink-700 font-light leading-relaxed mb-2">
                      {r.body}
                    </p>
                    {request?.request && (
                      <p className="text-xs text-ink-300 leading-relaxed border-l-2 border-mist-200 pl-3">
                        {request.request.length > 120
                          ? request.request.slice(0, 120) + '…'
                          : request.request}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
