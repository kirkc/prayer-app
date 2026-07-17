import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSuperAdminUser } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase-server'
import ErrorLogList from '@/components/ops/ErrorLogList'
import type { AppError } from '@/types'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ resolved?: string; scope?: string }> }

export default async function ErrorsPage({ searchParams }: Props) {
  const user = await getSuperAdminUser()
  if (!user) redirect('/admin')

  const { resolved, scope } = await searchParams
  const showResolved = resolved === '1'

  const service = createServiceClient()

  let query = service
    .from('app_errors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  if (showResolved) {
    query = query.not('resolved_at', 'is', null)
  } else {
    query = query.is('resolved_at', null)
  }
  if (scope) query = query.eq('scope', scope)

  const [{ data: errors }, { data: scopeRows }] = await Promise.all([
    query,
    service.from('app_errors').select('scope').order('scope'),
  ])

  const scopes = [...new Set((scopeRows ?? []).map(r => r.scope as string))]

  const filterHref = (params: { resolved?: string; scope?: string }) => {
    const qs = new URLSearchParams()
    if (params.resolved) qs.set('resolved', params.resolved)
    if (params.scope) qs.set('scope', params.scope)
    const s = qs.toString()
    return s ? `/admin/ops/errors?${s}` : '/admin/ops/errors'
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-8 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Error log</h1>
            <p className="text-sm text-ink-400 mt-1.5">What has gone wrong, kept honest</p>
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
            <Link
              href={filterHref({ scope })}
              className={`px-3 py-1 rounded-full text-xs transition-all duration-300 ${
                !showResolved ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'
              }`}
            >
              Open
            </Link>
            <Link
              href={filterHref({ resolved: '1', scope })}
              className={`px-3 py-1 rounded-full text-xs transition-all duration-300 ${
                showResolved ? 'bg-white text-ink-700 shadow-sm' : 'text-ink-400 hover:text-ink-600'
              }`}
            >
              Resolved
            </Link>
          </div>
          {scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {scope && (
                <Link
                  href={filterHref({ resolved: showResolved ? '1' : undefined })}
                  className="px-3 py-1 rounded-full text-xs bg-sage-100 text-sage-700"
                >
                  {scope} ×
                </Link>
              )}
              {!scope &&
                scopes.slice(0, 6).map(s => (
                  <Link
                    key={s}
                    href={filterHref({ resolved: showResolved ? '1' : undefined, scope: s })}
                    className="px-3 py-1 rounded-full text-xs text-ink-400 hover:text-ink-600 bg-mist-100 transition-colors duration-300"
                  >
                    {s}
                  </Link>
                ))}
            </div>
          )}
        </div>

        <div className="animate-rise" style={{ animationDelay: '0.1s' }}>
          <ErrorLogList errors={(errors ?? []) as AppError[]} />
        </div>
      </div>
    </main>
  )
}
