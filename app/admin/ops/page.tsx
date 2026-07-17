import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import { getTwilioHealth } from '@/lib/twilio'
import CronRunPanel from '@/components/ops/CronRunPanel'
import type { CronRun, MessageLogEntry } from '@/types'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<string, string> = {
  delivered: 'text-sage-600',
  sent: 'text-ink-400',
  delayed: 'text-ink-400',
  failed: 'text-red-400',
  undelivered: 'text-red-400',
  bounced: 'text-red-400',
  complained: 'text-red-400',
}

export default async function OpsPage() {
  const user = await getSuperAdminUser()
  if (!user) redirect('/admin')

  const service = createServiceClient()
  const [health, { count: unresolvedCount }, { data: runs }, { data: messages }] =
    await Promise.all([
      getTwilioHealth(),
      service
        .from('app_errors')
        .select('*', { count: 'exact', head: true })
        .is('resolved_at', null),
      service
        .from('cron_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20),
      service
        .from('message_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

  const allRuns = (runs ?? []) as CronRun[]
  const jobs = [
    {
      name: 'notifications' as const,
      label: 'Email digests',
      description: 'Daily & weekly prayer summaries to the team',
      runs: allRuns.filter(r => r.job === 'notifications').slice(0, 5),
    },
    {
      name: 'prayer-updates' as const,
      label: 'Prayer update texts',
      description: '“Someone prayed for you” recaps to requesters',
      runs: allRuns.filter(r => r.job === 'prayer-updates').slice(0, 5),
    },
  ]

  const errorCount = unresolvedCount ?? 0

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Operations</h1>
            <p className="text-sm text-ink-400 mt-1.5">How everything is running</p>
          </div>
          <Link
            href="/admin"
            className="text-sm text-ink-400 hover:text-ink-600 transition-colors duration-300"
          >
            Back to admin
          </Link>
        </div>

        {/* Health at a glance */}
        <div className="grid grid-cols-2 gap-3 mb-10 animate-rise" style={{ animationDelay: '0.05s' }}>
          <Link href="/admin/ops/errors" className="card p-5 text-center block">
            <p
              className={`font-display text-3xl font-light ${
                errorCount > 0 ? 'text-red-400' : 'text-ink-800'
              }`}
            >
              {errorCount}
            </p>
            <p className="text-xs text-ink-400 mt-1">
              Unresolved error{errorCount === 1 ? '' : 's'}
            </p>
          </Link>
          <div className="card p-5 text-center">
            {health ? (
              <>
                <p className="font-display text-3xl font-light text-ink-800">
                  ${Number(health.balance).toFixed(2)}
                </p>
                <p className="text-xs text-ink-400 mt-1">Twilio balance</p>
              </>
            ) : (
              <>
                <p className="font-display text-3xl font-light text-ink-300">—</p>
                <p className="text-xs text-ink-300 mt-1">Twilio unavailable</p>
              </>
            )}
          </div>
        </div>

        {health && health.usage.length > 0 && (
          <div className="mb-10 animate-rise" style={{ animationDelay: '0.08s' }}>
            <p className="text-xs tracking-[0.15em] uppercase text-ink-300 mb-3">
              Twilio this month
            </p>
            <div className="card p-5">
              <div className="flex flex-col gap-1.5">
                {health.usage.map(u => (
                  <div key={u.category} className="flex items-baseline justify-between text-xs">
                    <span className="text-ink-400">{u.category.replace(/-/g, ' ')}</span>
                    <span className="text-ink-600">
                      {u.count} · ${Number(u.price).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Scheduled jobs */}
        <section className="mb-10 animate-rise" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Scheduled jobs</h2>
          <CronRunPanel jobs={jobs} />
        </section>

        {/* Recent messages */}
        <section className="animate-rise" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-xl font-light text-ink-800">Recent messages</h2>
            <Link
              href="/admin/ops/messages"
              className="text-xs text-ink-400 hover:text-ink-600 transition-colors duration-300"
            >
              See all
            </Link>
          </div>
          {(messages ?? []).length === 0 ? (
            <p className="text-sm text-ink-300 py-6 text-center">No messages logged yet.</p>
          ) : (
            <div className="card">
              <div className="divide-y divide-mist-100">
                {((messages ?? []) as MessageLogEntry[]).map(m => (
                  <div key={m.id} className="px-6 py-3.5 flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-700 truncate">
                        {m.kind}
                        <span className="text-ink-300"> · {m.recipient}</span>
                      </p>
                    </div>
                    <span className={`text-xs shrink-0 ${STATUS_TONE[m.status] ?? 'text-ink-400'}`}>
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-ink-300 mt-3 leading-relaxed">
            Also here:{' '}
            <Link href="/admin/ops/requesters" className="text-sage-600 hover:text-sage-700">
              text-message requesters
            </Link>
            {' — '}phone numbers, prayer-text opt-ins, and data deletion.
          </p>
        </section>
      </div>
    </main>
  )
}
