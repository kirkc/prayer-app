'use client'

import { useState } from 'react'

export type Requester = {
  phone: string
  requestCount: number
  latestAt: string
  notifyPrayers: boolean
}

type Props = { requesters: Requester[] }

export default function RequesterList({ requesters: initial }: Props) {
  const [requesters, setRequesters] = useState(initial)
  const [busyPhone, setBusyPhone] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function deleteData(phone: string) {
    if (
      !confirm(
        `Delete all prayer request data for ${phone}? This is the same as them texting REMOVE and cannot be undone.`
      )
    ) {
      return
    }
    setBusyPhone(phone)
    setError('')
    const res = await fetch('/api/super/requesters', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setRequesters(prev => prev.filter(r => r.phone !== phone))
      setNotice(`Deleted ${data.deleted ?? 0} request${data.deleted === 1 ? '' : 's'}.`)
      setTimeout(() => setNotice(''), 4000)
    } else {
      setError(data.error ?? 'Could not delete their data.')
    }
    setBusyPhone(null)
  }

  if (requesters.length === 0) {
    return (
      <p className="text-sm text-ink-300 py-10 text-center">
        No requests with phone numbers yet.
      </p>
    )
  }

  return (
    <div className="card">
      {(error || notice) && (
        <p
          className={`text-sm px-6 pt-5 -mb-1 animate-breathe ${
            error ? 'text-red-500/80' : 'text-sage-600'
          }`}
        >
          {error || notice}
        </p>
      )}
      <div className="divide-y divide-mist-100">
        {requesters.map(r => (
          <div key={r.phone} className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-ink-700">{r.phone}</p>
                <p className="text-xs text-ink-300 mt-0.5">
                  {r.requestCount} request{r.requestCount === 1 ? '' : 's'} · latest{' '}
                  {new Date(r.latestAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                  {' · '}
                  {r.notifyPrayers ? 'prayer texts on' : 'prayer texts off'}
                </p>
              </div>
              <button
                onClick={() => deleteData(r.phone)}
                disabled={busyPhone === r.phone}
                className="text-xs text-ink-300 hover:text-red-400 transition-colors duration-300 disabled:opacity-50 shrink-0"
              >
                Delete their data
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
