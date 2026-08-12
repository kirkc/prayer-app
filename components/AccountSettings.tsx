'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Props = { email: string }

export default function AccountSettings({ email }: Props) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  async function deleteAccount() {
    setDeleting(true)
    setError('')
    const res = await fetch('/api/me', { method: 'DELETE' })
    if (res.ok) {
      // The user behind the cookie is gone; clear the stale session before
      // routing, or middleware bounces us around trying to refresh it.
      await createClient().auth.signOut()
      router.replace('/login')
      return
    }
    const data = await res.json().catch(() => ({}))
    setError(data.error ?? 'Could not delete your account.')
    setDeleting(false)
    setConfirmingDelete(false)
  }

  return (
    <div className="flex flex-col gap-4">
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
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm text-ink-700">Delete account</p>
            <p className="text-xs text-ink-300 mt-0.5">
              Removes your name, email, preferences, and prayer records for good.
            </p>
          </div>
          {!confirmingDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="btn btn-soft text-sm px-4 py-2 shrink-0 text-red-500/80"
            >
              Delete my account
            </button>
          )}
        </div>

        {confirmingDelete && (
          <div className="mt-4 pt-4 border-t border-mist-100">
            <p className="text-sm text-ink-600 leading-relaxed">
              This permanently deletes your account. You’ll lose access to your
              church’s requests, and it can’t be undone. The requests themselves
              stay with the church.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={deleteAccount}
                disabled={deleting}
                className="btn btn-soft text-sm px-4 py-2 text-red-500/80 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="btn btn-ghost text-sm px-4 py-2 disabled:opacity-50"
              >
                Keep my account
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500/80 animate-breathe">{error}</p>}
    </div>
  )
}
