'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Stage = 'checking' | 'invalid'

// Landing page for magic sign-in links. Supabase redirects here with a token;
// once the browser client establishes a session we send them to the dashboard.
// The exchange happens client-side (like set-password) because the server
// Supabase client is intentionally cookie-read-only.
export default function AuthConfirmPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [stage, setStage] = useState<Stage>('checking')

  useEffect(() => {
    const supabase = supabaseRef.current
    let done = false

    const succeed = () => {
      if (done) return
      done = true
      router.push('/dashboard')
      router.refresh()
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') succeed()
    })

    ;(async () => {
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        try { await supabase.auth.exchangeCodeForSession(code) } catch { /* fall through */ }
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) succeed()
    })()

    // If no session materializes, the link is invalid or already used.
    const timer = setTimeout(() => {
      if (!done) setStage('invalid')
    }, 3000)

    return () => { clearTimeout(timer); subscription.unsubscribe() }
  }, [router])

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise text-center">
        {stage === 'checking' ? (
          <p className="text-sm text-ink-300 py-8 animate-breathe">Signing you in…</p>
        ) : (
          <div className="card p-8">
            <p className="text-sm text-ink-600 leading-relaxed mb-2">
              This sign-in link is invalid or has expired.
            </p>
            <p className="text-sm text-ink-400 leading-relaxed mb-5">
              Request a fresh one and open it right away.
            </p>
            <Link href="/login" className="btn btn-soft text-sm px-4 py-2">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
