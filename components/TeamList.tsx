'use client'

import { useState } from 'react'

export type Member = {
  id: string
  display_name: string | null
  role: 'prayer' | 'admin'
  email: string
}

type Props = {
  members: Member[]
  currentUserId: string
}

export default function TeamList({ members: initial, currentUserId }: Props) {
  const [members, setMembers] = useState(initial)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Invite form
  const [inviting, setInviting] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)

  function flash(message: string) {
    setNotice(message)
    setError('')
    setTimeout(() => setNotice(''), 4000)
  }

  async function changeRole(id: string, role: Member['role']) {
    setBusyId(id)
    setError('')
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setMembers(prev => prev.map(m => (m.id === id ? { ...m, role } : m)))
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not update role.')
    }
    setBusyId(null)
  }

  async function sendReset(id: string, label: string) {
    setBusyId(id)
    setError('')
    const res = await fetch(`/api/admin/members/${id}/reset-password`, { method: 'POST' })
    if (res.ok) {
      flash(`Password reset sent to ${label}.`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not send the reset email.')
    }
    setBusyId(null)
  }

  async function removeMember(id: string, label: string) {
    if (!confirm(`Remove ${label} from the team? They will no longer be able to sign in.`)) return
    setBusyId(id)
    setError('')
    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      flash(`${label} has been removed.`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not remove the member.')
    }
    setBusyId(null)
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setSendingInvite(true)
    setError('')
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, display_name: inviteName }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setMembers(prev => [...prev, data.member])
      flash(`Invite sent to ${data.member.email}.`)
      setInviteEmail('')
      setInviteName('')
      setInviting(false)
    } else {
      setError(data.error ?? 'Could not send the invite.')
    }
    setSendingInvite(false)
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
        {members.map(m => {
          const isSelf = m.id === currentUserId
          const label = m.display_name ?? m.email
          return (
            <div key={m.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-ink-700 truncate">
                    {label}
                    {isSelf && <span className="text-ink-300"> · you</span>}
                  </p>
                  {m.display_name && (
                    <p className="text-xs text-ink-300 truncate mt-0.5">{m.email}</p>
                  )}
                </div>

                {isSelf ? (
                  <span className="text-xs text-ink-400 shrink-0 capitalize">{m.role}</span>
                ) : (
                  <div className="flex gap-1 bg-mist-100 rounded-full p-0.5 shrink-0">
                    {(['prayer', 'admin'] as const).map(role => (
                      <button
                        key={role}
                        onClick={() => m.role !== role && changeRole(m.id, role)}
                        disabled={busyId === m.id}
                        className={`px-3 py-1 rounded-full text-xs transition-all duration-300 disabled:opacity-50 ${
                          m.role === role
                            ? 'bg-white text-ink-700 shadow-sm'
                            : 'text-ink-400 hover:text-ink-600'
                        }`}
                      >
                        {role === 'prayer' ? 'Team' : 'Admin'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isSelf && (
                <div className="flex items-center gap-4 mt-2 text-xs text-ink-300">
                  <button
                    onClick={() => sendReset(m.id, label)}
                    disabled={busyId === m.id}
                    className="hover:text-ink-500 transition-colors duration-300 disabled:opacity-50"
                  >
                    Send password reset
                  </button>
                  <button
                    onClick={() => removeMember(m.id, label)}
                    disabled={busyId === m.id}
                    className="hover:text-red-400 transition-colors duration-300 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Invite */}
      <div className="border-t border-mist-100 px-6 py-4">
        {inviting ? (
          <form onSubmit={sendInvite} className="flex flex-col gap-3 animate-breathe">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="Email"
                className="input flex-1"
              />
              <input
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Name (optional)"
                className="input flex-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={sendingInvite || !inviteEmail.trim()}
                className="btn btn-primary text-sm px-5 py-2 font-medium disabled:opacity-50"
              >
                {sendingInvite ? 'Sending…' : 'Send invite'}
              </button>
              <button
                type="button"
                onClick={() => { setInviting(false); setError('') }}
                disabled={sendingInvite}
                className="btn btn-ghost text-sm px-2"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setInviting(true)}
            className="text-sm text-sage-600 hover:text-sage-700 transition-colors duration-300"
          >
            Invite a team member
          </button>
        )}
      </div>
    </div>
  )
}
