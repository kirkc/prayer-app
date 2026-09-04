'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Stage = 'checking' | 'ready' | 'saving' | 'invalid'
type ResendStage = 'idle' | 'sending' | 'sent'

// Landing page for invite and password-reset email links. Supabase redirects
// here with a token; once the session is established, the member chooses a
// new password.
export default function SetPasswordPage() {
  const router = useRouter()
  // Created on first use, never during render. This is a client component,
  // but Next still renders it once on the server to prerender the page, and
  // createBrowserClient throws there without the NEXT_PUBLIC_* vars. Both
  // callers below are client-only (an effect and a submit handler).
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const getSupabase = () => (supabaseRef.current ??= createClient())
  const [stage, setStage] = useState<Stage>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  // A dead link is a dead end otherwise — the member can't sign in to ask for
  // a new one. `linkType` comes off the URL so the fresh email is worded the
  // way the original was (invite vs reset).
  const [linkType, setLinkType] = useState<'invite' | 'recovery'>('recovery')
  const [resendEmail, setResendEmail] = useState('')
  const [resendStage, setResendStage] = useState<ResendStage>('idle')
  const [resendError, setResendError] = useState('')

  useEffect(() => {
    const supabase = getSupabase()
    let done = false

    const settle = (ok: boolean) => {
      if (!done) {
        done = true
        setStage(ok ? 'ready' : 'invalid')
      }
    }

    // Auth events fire as the client processes the token from the URL.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') settle(true)
    })

    ;(async () => {
      const params = new URLSearchParams(window.location.search)

      // Links emailed via Resend carry ?token_hash=…&type=(recovery|invite);
      // verify it to establish the session (see lib/auth-email.ts).
      const tokenHash = params.get('token_hash')
      const type = params.get('type')
      if (type === 'invite') setLinkType('invite')
      if (tokenHash && (type === 'recovery' || type === 'invite')) {
        try { await supabase.auth.verifyOtp({ token_hash: tokenHash, type }) } catch { /* fall through */ }
      }

      // Some link formats arrive as ?code=… — exchange it explicitly.
      const code = params.get('code')
      if (code) {
        try { await supabase.auth.exchangeCodeForSession(code) } catch { /* fall through */ }
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) settle(true)
    })()

    // If nothing produced a session shortly, the link is invalid or expired.
    const timer = setTimeout(() => settle(false), 3000)
    return () => { clearTimeout(timer); subscription.unsubscribe() }
  }, [])

  async function handleResend(e: React.FormEvent) {
    e.preventDefault()
    setResendError('')
    setResendStage('sending')
    const res = await fetch('/api/auth/resend-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resendEmail.trim(), type: linkType }),
    }).catch(() => null)

    if (res?.ok) {
      setResendStage('sent')
      return
    }
    const message =
      res?.status === 429
        ? 'Too many links requested — please wait a few minutes.'
        : 'Could not send the link. Please try again.'
    setResendError(message)
    setResendStage('idle')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Please use at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setStage('saving')

    const { error } = await getSupabase().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setStage('ready')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-light text-ink-800">
            Choose a password
          </h1>
          <p className="text-sm text-ink-400 mt-2">Prayer team dashboard</p>
        </div>

        {stage === 'checking' ? (
          <p className="text-sm text-ink-300 text-center py-8 animate-breathe">
            One moment…
          </p>
        ) : stage === 'invalid' ? (
          <div className="card p-8">
            {resendStage === 'sent' ? (
              <>
                <p className="text-sm text-ink-600 leading-relaxed mb-2 text-center">
                  Check your email.
                </p>
                <p className="text-sm text-ink-400 leading-relaxed text-center">
                  If that address has an account, a new link is on its way. It&apos;s
                  good for 24 hours.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-600 leading-relaxed mb-2 text-center">
                  This link is invalid or has expired.
                </p>
                <p className="text-sm text-ink-400 leading-relaxed mb-5 text-center">
                  Enter your email and we&apos;ll send a fresh one.
                </p>
                <form onSubmit={handleResend} className="space-y-4">
                  <input
                    type="email"
                    required
                    autoFocus
                    placeholder="you@church.org"
                    aria-label="Email address"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                    className="input"
                  />
                  {resendError && (
                    <p className="text-sm text-red-500/80 animate-breathe">{resendError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={resendStage === 'sending'}
                    className="btn btn-primary w-full py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    {resendStage === 'sending' ? 'Sending…' : 'Send me a new link'}
                  </button>
                </form>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-8 space-y-5">
            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="password">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input"
              />
            </div>

            {error && <p className="text-sm text-red-500/80 animate-breathe">{error}</p>}

            <button
              type="submit"
              disabled={stage === 'saving'}
              className="btn btn-primary w-full py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {stage === 'saving' ? 'Saving…' : 'Save and continue'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
