'use client'

import { useState } from 'react'
import { PrayerRequestWithState } from '@/types'

type Props = {
  prayer: PrayerRequestWithState
  onStatusChange: (id: string, status: PrayerRequestWithState['status']) => void
  onDelete: (id: string) => void
  onLocalChange: (id: string, patch: Partial<PrayerRequestWithState>) => void
  index?: number
}

export default function PrayerCard({
  prayer,
  onStatusChange,
  onDelete,
  onLocalChange,
  index = 0,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [responding, setResponding] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canReply = prayer.source === 'sms'

  async function togglePray() {
    setBusy(true)
    setError('')
    const method = prayer.you_prayed ? 'DELETE' : 'POST'
    const res = await fetch(`/api/prayers/${prayer.id}/pray`, { method })
    if (res.ok) {
      const data = await res.json()
      onLocalChange(prayer.id, { you_prayed: data.you_prayed, prayed_count: data.prayed_count })
    } else {
      setError('Could not update. Please try again.')
    }
    setBusy(false)
  }

  async function sendResponse() {
    if (!message.trim()) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/prayers/${prayer.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: message.trim() }),
    })
    if (res.ok) {
      const data = await res.json()
      onLocalChange(prayer.id, {
        replied: true,
        you_prayed: true,
        prayed_count: data.prayed_count,
      })
      setResponding(false)
      setMessage('')
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not send the response.')
    }
    setBusy(false)
  }

  async function changeStatus(status: PrayerRequestWithState['status']) {
    setBusy(true)
    await fetch(`/api/prayers/${prayer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onStatusChange(prayer.id, status)
  }

  async function remove() {
    if (!confirm('Permanently delete this prayer request?')) return
    setBusy(true)
    await fetch(`/api/prayers/${prayer.id}`, { method: 'DELETE' })
    onDelete(prayer.id)
  }

  const date = new Date(prayer.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const prayedLabel =
    prayer.prayed_count === 0
      ? 'No one has prayed yet'
      : prayer.prayed_count === 1
        ? '1 person has prayed'
        : `${prayer.prayed_count} people have prayed`

  return (
    <div
      className="card p-6 sm:p-7 flex flex-col gap-4 animate-rise"
      style={{ animationDelay: `${Math.min(index * 0.06, 0.4)}s` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink-800">
          {prayer.name ?? 'Anonymous'}
        </span>
        <span className="text-xs text-ink-300 shrink-0">{date}</span>
      </div>

      <p className="text-ink-700 leading-relaxed whitespace-pre-wrap font-light">
        {prayer.request}
      </p>

      <div className="flex items-center gap-2 text-xs text-ink-400">
        <span>{prayedLabel}</span>
        {prayer.you_prayed && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-ink-300" />
            <span className="text-sage-600">You prayed</span>
          </>
        )}
        {prayer.replied && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-ink-300" />
            <span className="text-sage-600">Replied</span>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-500/80 animate-breathe">{error}</p>}

      {/* Primary care actions */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          onClick={togglePray}
          disabled={busy}
          className={`btn text-sm px-6 py-2 font-medium disabled:opacity-50 ${
            prayer.you_prayed ? 'btn-soft' : 'btn-primary'
          }`}
        >
          {prayer.you_prayed ? 'Prayed' : 'Pray'}
        </button>

        {canReply && !responding && (
          <button
            onClick={() => setResponding(true)}
            disabled={busy}
            className="btn btn-ghost text-sm px-4 py-2 disabled:opacity-50"
          >
            Respond
          </button>
        )}
      </div>

      {/* Respond composer */}
      {responding && (
        <div className="flex flex-col gap-3 animate-breathe">
          <textarea
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Write a short, warm reply. It will be sent as a text message."
            className="input resize-none leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={sendResponse}
              disabled={busy || !message.trim()}
              className="btn btn-primary text-sm px-6 py-2 font-medium disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Send reply'}
            </button>
            <button
              onClick={() => { setResponding(false); setMessage(''); setError('') }}
              disabled={busy}
              className="btn btn-ghost text-sm px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Quiet triage actions */}
      <div className="flex items-center gap-4 pt-3 border-t border-mist-100 text-xs text-ink-300">
        {prayer.status !== 'active' && (
          <button onClick={() => changeStatus('active')} disabled={busy}
            className="hover:text-ink-500 transition-colors duration-300 disabled:opacity-50">
            Restore
          </button>
        )}
        {prayer.status !== 'archived' && (
          <button onClick={() => changeStatus('archived')} disabled={busy}
            className="hover:text-ink-500 transition-colors duration-300 disabled:opacity-50">
            Archive
          </button>
        )}
        {prayer.status !== 'spam' && (
          <button onClick={() => changeStatus('spam')} disabled={busy}
            className="hover:text-ink-500 transition-colors duration-300 disabled:opacity-50">
            Mark spam
          </button>
        )}
        <button onClick={remove} disabled={busy}
          className="hover:text-red-400 transition-colors duration-300 disabled:opacity-50 ml-auto">
          Delete
        </button>
      </div>
    </div>
  )
}
