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
    { count: totalRequests },
    { count: activeRequests },
    { count: repliedRequests },
    { count: totalPrayers },
    { data: profiles },
    { data: authUsers },
    { data: responses },
  ] = await Promise.all([
    supabase.from('prayer_requests').select('*', { count: 'exact', head: true }),
    supabase.from('prayer_requests').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('prayer_requests').select('*', { count: 'exact', head: true }).eq('replied', true),
    supabase.from('prayers').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('id, display_name, role, created_at').order('created_at'),
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
  }))

  const stats = [
    { label: 'Requests', value: totalRequests ?? 0 },
    { label: 'Active', value: activeRequests ?? 0 },
    { label: 'Replied', value: repliedRequests ?? 0 },
    { label: 'Prayers', value: totalPrayers ?? 0 },
  ]

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Admin</h1>
            <p className="text-sm text-ink-400 mt-1.5">A quiet look at the whole picture</p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-400 hover:text-ink-600 transition-colors duration-300"
          >
            Back to requests
          </Link>
        </div>

        {/* Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10 animate-rise" style={{ animationDelay: '0.05s' }}>
          {stats.map(s => (
            <div key={s.label} className="card p-5 text-center">
              <p className="font-display text-3xl font-light text-ink-800">{s.value}</p>
              <p className="text-xs text-ink-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Team */}
        <section className="mb-10 animate-rise" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Prayer team</h2>
          <TeamList members={members} currentUserId={admin.id} />
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
