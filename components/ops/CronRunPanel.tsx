'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CronJobName, CronRun } from '@/types'

type Props = {
  jobs: { name: CronJobName; label: string; description: string; runs: CronRun[] }[]
}

function runOutcome(run: CronRun): { text: string; tone: 'ok' | 'bad' | 'quiet' } {
  if (run.finished_at === null) return { text: 'running…', tone: 'quiet' }
  const sent = typeof run.summary?.sent === 'number' ? (run.summary.sent as number) : null
  const errors = typeof run.summary?.errors === 'number' ? (run.summary.errors as number) : 0
  if (run.ok === false) {
    return { text: errors > 0 ? `${errors} failed` : 'failed', tone: 'bad' }
  }
  return { text: sent === null ? 'ok' : `${sent} sent`, tone: 'ok' }
}

export default function CronRunPanel({ jobs }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<CronJobName | null>(null)
  const [notice, setNotice] = useState('')

  async function runNow(job: CronJobName, label: string) {
    setBusy(job)
    setNotice('')
    const res = await fetch(`/api/super/cron/${job}`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      const sent = typeof data.sent === 'number' ? data.sent : 0
      setNotice(`${label} finished — ${sent} sent.`)
      router.refresh()
    } else {
      setNotice(data.error ?? `${label} failed.`)
    }
    setBusy(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {notice && <p className="text-sm text-sage-600 animate-breathe">{notice}</p>}
      {jobs.map(job => (
        <div key={job.name} className="card p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-sm text-ink-700">{job.label}</p>
              <p className="text-xs text-ink-300 mt-0.5">{job.description}</p>
            </div>
            <button
              onClick={() => runNow(job.name, job.label)}
              disabled={busy !== null}
              className="btn btn-soft text-xs px-4 py-1.5 shrink-0 disabled:opacity-50"
            >
              {busy === job.name ? 'Running…' : 'Run now'}
            </button>
          </div>
          {job.runs.length === 0 ? (
            <p className="text-xs text-ink-300">No runs recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {job.runs.map(run => {
                const outcome = runOutcome(run)
                return (
                  <div key={run.id} className="flex items-baseline justify-between text-xs">
                    <span className="text-ink-400">
                      {new Date(run.started_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                      {run.trigger === 'manual' && <span className="text-ink-300"> · manual</span>}
                    </span>
                    <span
                      className={
                        outcome.tone === 'bad'
                          ? 'text-red-400'
                          : outcome.tone === 'ok'
                            ? 'text-sage-600'
                            : 'text-ink-300'
                      }
                    >
                      {outcome.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
