import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import type { MessageLogEntry } from '@/types'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ channel?: string; status?: string }> }

const STATUS_TONE: Record<string, string> = {
  delivered: 'text-sage-600',
  sent: 'text-ink-400',
  delayed: 'text-ink-400',
  failed: 'text-red-400',
  undelivered: 'text-red-400',
  bounced: 'text-red-400',
  complained: 'text-red-400',
}

const PROBLEM_STATUSES = ['failed', 'undelivered', 'bounced', 'complained']

export default async function MessagesPage({ searchParams }: Props) {
  const user = await getSuperAdminUser()
  if (!user) redirect('/admin')

  const { channel, status } = await searchParams

  const service = createServiceClient()
  let query = service
    .from('message_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (channel === 'sms' || channel === 'email') query = query.eq('channel', channel)
  if (status === 'problems') query = query.in('status', PROBLEM_STATUSES)

  const { data } = await query
  const messages = (data ?? []) as MessageLogEntry[]

  const filterHref = (params: { channel?: string; status?: string }) => {
    const qs = new URLSearchParams()
    if (params.channel) qs.set('channel', params.channel)
    if (params.status) qs.set('status', params.status)
    const s = qs.toString()
    return s ? `/admin/ops/messages?${s}` : '/admin/ops/messages'
  }

  const pill = (label: string, href: string, active: boolean) => (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full text-xs transition-all duration-300 ${
        active ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-8 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Messages</h1>
            <p className="text-sm text-ink-400 mt-1.5">Every text and email, and how it landed</p>
          </div>
          <Link
            href="/admin/ops"
            className="text-sm text-ink-400 hover:text-ink-600 transition-colors duration-300"
          >
            Back to operations
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6 animate-rise" style={{ animationDelay: '0.05s' }}>
          <div className="flex gap-1 bg-mist-100 rounded-full p-0.5">
            {pill('All', filterHref({ status }), !channel)}
            {pill('Texts', filterHref({ channel: 'sms', status }), channel === 'sms')}
            {pill('Email', filterHref({ channel: 'email', status }), channel === 'email')}
          </div>
          <div className="flex gap-1 bg-mist-100 rounded-full p-0.5">
            {pill('Everything', filterHref({ channel }), status !== 'problems')}
            {pill('Problems', filterHref({ channel, status: 'problems' }), status === 'problems')}
          </div>
        </div>

        <div className="animate-rise" style={{ animationDelay: '0.1s' }}>
          {messages.length === 0 ? (
            <p className="text-sm text-ink-300 py-10 text-center">No messages match.</p>
          ) : (
            <div className="card">
              <div className="divide-y divide-mist-100">
                {messages.map(m => (
                  <div key={m.id} className="px-6 py-4">
                    <div className="flex items-baseline justify-between gap-4 mb-1">
                      <p className="text-sm text-ink-700 truncate">
                        {m.kind}
                        <span className="text-ink-300"> · {m.recipient}</span>
                      </p>
                      <span className={`text-xs shrink-0 ${STATUS_TONE[m.status] ?? 'text-ink-400'}`}>
                        {m.status}
                        {m.error_code && ` · ${m.error_code}`}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-xs text-ink-300 truncate">
                        {m.subject ?? m.body_preview ?? ''}
                      </p>
                      <span className="text-xs text-ink-300 shrink-0">
                        {new Date(m.created_at).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {m.error_message && (
                      <p className="text-xs text-red-400/80 mt-1.5 break-words">{m.error_message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
