'use client'

import { useRef, useState } from 'react'
import type { NotifyFrequency } from '@/types'

const FREQUENCIES: { value: NotifyFrequency; label: string; hint: string }[] = [
  { value: 'immediate', label: 'Immediately', hint: 'An email for each new prayer request as it arrives.' },
  { value: 'daily', label: 'Daily digest', hint: 'One summary each morning of the day’s new requests.' },
  { value: 'weekly', label: 'Weekly digest', hint: 'One summary each week of new requests.' },
]

type Props = {
  initialEnabled: boolean
  initialFrequency: NotifyFrequency
}

type TestResult = {
  email: boolean
  push: { configured: boolean; devices: number; sent: number; failed: number }
}

export default function NotificationSettings({ initialEnabled, initialFrequency }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [frequency, setFrequency] = useState<NotifyFrequency>(initialFrequency)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function flash(msg: string) {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 3000)
  }

  async function save(patch: { notify_new_requests?: boolean; notify_frequency?: NotifyFrequency }) {
    setBusy(true)
    setError('')
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setBusy(false)
    if (res.ok) {
      flash('Saved')
      return true
    }
    const data = await res.json().catch(() => ({}))
    setError(data.error ?? 'Could not save your settings.')
    return false
  }

  async function toggleEnabled() {
    const next = !enabled
    setEnabled(next)
    const ok = await save({ notify_new_requests: next })
    if (!ok) setEnabled(!next) // revert on failure
  }

  async function chooseFrequency(value: NotifyFrequency) {
    if (value === frequency) return
    const prev = frequency
    setFrequency(value)
    const ok = await save({ notify_frequency: value })
    if (!ok) setFrequency(prev)
  }

  // Spell out the push half rather than saying "sent" — "0 devices" and "no
  // APNs key on the server" both look like silence from the phone, and this
  // button exists precisely to tell them apart.
  function describe(result: TestResult): string {
    const parts = [result.email ? 'Email sent' : 'Email failed']
    const { configured, devices, sent, failed } = result.push
    if (!configured) parts.push('push isn’t configured on the server')
    else if (devices === 0) parts.push('no devices registered for push')
    else if (failed > 0) parts.push(`push failed for ${failed} of ${devices} device${devices === 1 ? '' : 's'}`)
    else parts.push(`push sent to ${sent} device${sent === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }

  async function sendTest() {
    setBusy(true)
    setError('')
    const res = await fetch('/api/settings/test', { method: 'POST' })
    setBusy(false)
    const data = await res.json().catch(() => ({}))
    if (res.ok) flash(describe(data as TestResult))
    else setError(data.error ?? 'Could not send the test notification.')
  }

  return (
    <div className="card p-8 space-y-6">
      {/* Master toggle */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-800">New prayer requests</p>
          <p className="text-sm text-ink-400 mt-0.5">Email me when a new request comes in.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggleEnabled}
          disabled={busy}
          className={`relative w-11 h-6 rounded-full transition-colors duration-300 disabled:opacity-50 shrink-0 ${
            enabled ? 'bg-sage-500' : 'bg-mist-300'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-300 ${
              enabled ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      {/* Frequency */}
      <div className={`space-y-2 transition-opacity duration-300 ${enabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <p className="text-sm text-ink-600 mb-1">How often</p>
        {FREQUENCIES.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => chooseFrequency(f.value)}
            disabled={busy || !enabled}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition-colors duration-300 ${
              frequency === f.value
                ? 'border-sage-400 bg-sage-50'
                : 'border-mist-200 hover:border-mist-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${frequency === f.value ? 'bg-sage-500' : 'bg-mist-300'}`} />
              <span className="text-sm font-medium text-ink-700">{f.label}</span>
            </span>
            <span className="block text-xs text-ink-400 mt-1 ml-4">{f.hint}</span>
          </button>
        ))}
      </div>

      {/* Channels */}
      <p className="text-xs text-ink-300 border-t border-mist-100 pt-4">
        Notifications are sent by email, and as a push notification to the
        iPhone app if you use it. Text-message alerts are coming later.
      </p>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="btn btn-soft text-sm px-4 py-2 disabled:opacity-50"
        >
          Send a test notification
        </button>
        {notice && <span className="text-sm text-sage-600 animate-breathe">{notice}</span>}
        {error && <span className="text-sm text-red-500/80 animate-breathe">{error}</span>}
      </div>
    </div>
  )
}
