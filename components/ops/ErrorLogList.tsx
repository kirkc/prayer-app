'use client'

import { useState } from 'react'
import type { AppError } from '@/types'

type Props = { errors: AppError[] }

export default function ErrorLogList({ errors: initial }: Props) {
  const [errors, setErrors] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function setResolved(id: string, resolved: boolean) {
    setBusyId(id)
    const res = await fetch(`/api/super/errors/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    })
    if (res.ok) {
      setErrors(prev =>
        prev.map(e =>
          e.id === id
            ? { ...e, resolved_at: resolved ? new Date().toISOString() : null }
            : e
        )
      )
    }
    setBusyId(null)
  }

  if (errors.length === 0) {
    return (
      <p className="text-sm text-ink-300 py-10 text-center">
        Nothing here — all quiet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {errors.map(e => {
        const open = openId === e.id
        const resolved = e.resolved_at !== null
        return (
          <div key={e.id} className={`card p-5 ${resolved ? 'opacity-60' : ''}`}>
            <div className="flex items-baseline justify-between gap-4 mb-1.5">
              <span className="text-xs text-ink-400">{e.scope}</span>
              <span className="text-xs text-ink-300 shrink-0">
                {new Date(e.created_at).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>
            <p className="text-sm text-ink-700 font-light leading-relaxed break-words">
              {e.message}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-ink-300">
              {e.detail && (
                <button
                  onClick={() => setOpenId(open ? null : e.id)}
                  className="hover:text-ink-500 transition-colors duration-300"
                >
                  {open ? 'Hide detail' : 'Show detail'}
                </button>
              )}
              <button
                onClick={() => setResolved(e.id, !resolved)}
                disabled={busyId === e.id}
                className="hover:text-sage-600 transition-colors duration-300 disabled:opacity-50"
              >
                {resolved ? 'Reopen' : 'Mark resolved'}
              </button>
            </div>
            {open && e.detail && (
              <pre className="mt-3 p-3 bg-mist-100 rounded-xl text-xs text-ink-600 overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(e.detail, null, 2)}
              </pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
