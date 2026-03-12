'use client'

import { useState } from 'react'
import { PrayerRequest } from '@/types'

type Props = {
  prayer: PrayerRequest
  onUpdate: (id: string, status: PrayerRequest['status']) => void
  onDelete: (id: string) => void
}

export default function PrayerCard({ prayer, onUpdate, onDelete }: Props) {
  const [busy, setBusy] = useState(false)

  async function handleStatus(status: PrayerRequest['status']) {
    setBusy(true)
    await fetch(`/api/prayers/${prayer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    onUpdate(prayer.id, status)
    setBusy(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this prayer request permanently?')) return
    setBusy(true)
    await fetch(`/api/prayers/${prayer.id}`, { method: 'DELETE' })
    onDelete(prayer.id)
    setBusy(false)
  }

  const sourceBadge =
    prayer.source === 'sms'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-blue-100 text-blue-700'

  const date = new Date(prayer.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-800">
            {prayer.name ?? 'Anonymous'}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceBadge}`}>
            {prayer.source.toUpperCase()}
          </span>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{date}</span>
      </div>

      <p className="text-gray-700 text-sm leading-relaxed">{prayer.request}</p>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {prayer.status !== 'active' && (
          <button
            onClick={() => handleStatus('active')}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
          >
            Restore
          </button>
        )}
        {prayer.status !== 'archived' && (
          <button
            onClick={() => handleStatus('archived')}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Archive
          </button>
        )}
        {prayer.status !== 'spam' && (
          <button
            onClick={() => handleStatus('spam')}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-50 transition-colors"
          >
            Mark spam
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
