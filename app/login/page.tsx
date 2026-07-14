'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  async function handleMagicLink() {
    if (!email.trim()) {
      setError('Enter your email first, then request a link.')
      return
    }
    setError(null)
    setMagicLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        // Existing team members only — a link never provisions a new account.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    setMagicLoading(false)
    if (error) setError(error.message)
    else setMagicSent(true)
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-light text-ink-800">
            Welcome back
          </h1>
          <p className="text-sm text-ink-400 mt-2">Prayer team dashboard</p>
        </div>

        {magicSent ? (
          <div className="card p-8 text-center animate-breathe">
            <p className="text-sm text-ink-600 leading-relaxed mb-2">
              Check your email for a sign-in link.
            </p>
            <p className="text-sm text-ink-400 leading-relaxed">
              Open it on this device and you&rsquo;ll be signed straight in.
            </p>
            <button
              onClick={() => setMagicSent(false)}
              className="btn btn-ghost text-sm mt-5"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-8 space-y-5">
            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input"
              />
            </div>

            {error && <p className="text-sm text-red-500/80 animate-breathe">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-mist-200" />
              <span className="text-xs text-ink-300">or</span>
              <span className="h-px flex-1 bg-mist-200" />
            </div>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={magicLoading}
              className="btn btn-soft w-full py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {magicLoading ? 'Sending link…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
