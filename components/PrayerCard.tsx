'use client'

import { useState } from 'react'
import { PrayerRequestWithState, ThreadMessage } from '@/types'
import { reactionGlyph } from '@/lib/sms-inbound'

type Props = {
  prayer: PrayerRequestWithState
  onStatusChange: (id: string, status: PrayerRequestWithState['status']) => void
  onDelete: (id: string) => void
  onLocalChange: (id: string, patch: Partial<PrayerRequestWithState>) => void
  index?: number
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.floor(minutes)}m ago`
  const hours = minutes / 60
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = hours / 24
  if (days < 7) return `${Math.floor(days)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
  const [threadOpen, setThreadOpen] = useState(false)
  // null = not loaded yet
  const [thread, setThread] = useState<ThreadMessage[] | null>(null)

  // Any request with a phone on file can be replied to by text — SMS requests
  // always have one; web requests only when the requester opted in.
  const canReply = prayer.has_phone
  const replyCount = prayer.reply_count ?? 0
  // There's a conversation to show once we've written to them or they've
  // written back.
  const hasThread = replyCount > 0 || prayer.replied

  async function loadThread() {
    const res = await fetch(`/api/prayers/${prayer.id}/thread`)
    if (res.ok) {
      const data = await res.json()
      setThread(data.items ?? [])
    } else {
      setThread([])
    }
  }

  async function toggleThread() {
    const next = !threadOpen
    setThreadOpen(next)
    if (next && thread === null) await loadThread()
  }

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
      if (threadOpen) await loadThread()
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

  // This "request" was really a text back to us: file it on the person's
  // earlier request and take it off the feed.
  async function moveToThread() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/prayers/${prayer.id}/reclassify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: 'thread' }),
    })
    if (res.ok) {
      onDelete(prayer.id)
      return
    }
    const data = await res.json().catch(() => ({}))
    setError(data.error ?? 'Could not move this to a thread.')
    setBusy(false)
  }

  // The reverse: a reply in the thread was really a new request.
  async function promote(messageId: string) {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/inbound/${messageId}/promote`, { method: 'POST' })
    if (res.ok) {
      onLocalChange(prayer.id, { reply_count: Math.max(replyCount - 1, 0) })
      await loadThread()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not make this a request.')
    }
    setBusy(false)
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

  const threadLabel =
    replyCount === 0 ? 'Replied' : replyCount === 1 ? '1 reply' : `${replyCount} replies`

  const requesterName = prayer.name ?? 'Anonymous'

  return (
    <div
      className="card p-6 sm:p-7 flex flex-col gap-4 animate-rise"
      style={{ animationDelay: `${Math.min(index * 0.06, 0.4)}s` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-ink-800">
          {requesterName}
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
        {hasThread && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-ink-300" />
            <button
              onClick={toggleThread}
              className="text-sage-600 hover:text-sage-700 transition-colors duration-300"
              aria-expanded={threadOpen}
            >
              {threadLabel}
            </button>
          </>
        )}
      </div>

      {/* The conversation: our texts to them, their texts back */}
      {threadOpen && (
        <div className="flex flex-col gap-3 pl-4 border-l-2 border-mist-100 animate-breathe">
          {thread === null ? (
            <p className="text-xs text-ink-300">One moment…</p>
          ) : thread.length === 0 ? (
            <p className="text-xs text-ink-300">Nothing here yet.</p>
          ) : (
            thread.map(m =>
              m.kind === 'reaction' ? (
                <p key={m.id} className="flex items-center gap-2 text-xs text-ink-300">
                  <span className="text-base leading-none" aria-label="reaction">
                    {reactionGlyph(m.body)}
                  </span>
                  <span>{requesterName} · {timeAgo(m.at)}</span>
                </p>
              ) : (
                <div key={m.id} className="flex flex-col gap-0.5">
                  <p className="text-xs text-ink-300">
                    {m.direction === 'out' ? (m.author ?? 'Prayer team') : requesterName}
                    {' · '}
                    {timeAgo(m.at)}
                  </p>
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      m.direction === 'out' ? 'text-ink-500' : 'text-ink-700'
                    }`}
                  >
                    {m.body}
                  </p>
                  {m.direction === 'in' && (
                    <button
                      onClick={() => promote(m.id)}
                      disabled={busy}
                      className="self-start text-xs text-ink-300 hover:text-ink-500 transition-colors duration-300 disabled:opacity-50"
                    >
                      Make this a request
                    </button>
                  )}
                </div>
              )
            )
          )}
        </div>
      )}

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
        {prayer.source === 'sms' && prayer.has_phone && (
          <button onClick={moveToThread} disabled={busy}
            title="This was a text back to us, not a new request"
            className="hover:text-ink-500 transition-colors duration-300 disabled:opacity-50">
            Move to thread
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
