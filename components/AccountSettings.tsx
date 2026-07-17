'use client'

import { useState } from 'react'

type Props = { email: string }

export default function AccountSettings({ email }: Props) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function sendReset() {
    setSending(true)
    setError('')
    const res = await fetch('/api/settings/reset-password', { method: 'POST' })
    if (res.ok) {
      setSent(true)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not send the reset email.')
    }
    setSending(false)
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-ink-700">Password</p>
          <p className="text-xs text-ink-300 mt-0.5 truncate">
            {sent
              ? `Reset link sent to ${email} — open it to choose a new password.`
              : 'We’ll email you a link to choose a new one.'}
          </p>
        </div>
        {!sent && (
          <button
            onClick={sendReset}
            disabled={sending}
            className="btn btn-soft text-sm px-4 py-2 shrink-0 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send reset link'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-500/80 mt-3 animate-breathe">{error}</p>}
    </div>
  )
}
