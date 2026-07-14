'use client'

import { useState } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error'

export default function HomePage() {
  const [name, setName] = useState('')
  const [request, setRequest] = useState('')
  const [phone, setPhone] = useState('')
  const [notifyPrayers, setNotifyPrayers] = useState(false)
  const [website, setWebsite] = useState('') // honeypot — real users leave blank
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setErrorMsg('')

    const res = await fetch('/api/prayers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim() || null,
        request,
        phone: notifyPrayers ? phone.trim() : '',
        notify_prayers: notifyPrayers && phone.trim() !== '',
        website,
      }),
    })

    if (res.ok) {
      setState('success')
      setName('')
      setRequest('')
      setPhone('')
      setNotifyPrayers(false)
    } else {
      const data = await res.json()
      setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="text-center mb-10 animate-rise">
          <p className="text-xs tracking-[0.25em] uppercase text-sage-500 mb-4">
            We&rsquo;re here with you
          </p>
          <h1 className="font-display text-4xl font-light text-ink-800">
            Prayer Requests
          </h1>
          <p className="text-ink-400 mt-4 text-sm leading-relaxed">
            Share what&rsquo;s on your heart and our team will pray for you.
            <br />
            You can also text us directly.
          </p>
        </div>

        {state === 'success' ? (
          <div className="card p-10 text-center animate-rise">
            <div className="w-10 h-10 mx-auto mb-5 rounded-full bg-sage-100 flex items-center justify-center">
              <span className="block w-2 h-2 rounded-full bg-sage-500" />
            </div>
            <h2 className="font-display text-2xl font-light text-ink-800 mb-2">
              Thank you
            </h2>
            <p className="text-sm text-ink-400 leading-relaxed mb-7">
              We received your prayer request
              <br />
              and will be praying for you.
            </p>
            <button
              onClick={() => setState('idle')}
              className="btn btn-ghost text-sm"
            >
              Share another request
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="card p-8 sm:p-10 flex flex-col gap-6 animate-rise"
            style={{ animationDelay: '0.1s' }}
          >
            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="name">
                Your name <span className="text-ink-300">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="First name, or leave blank"
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm text-ink-600 mb-2" htmlFor="request">
                Prayer request
              </label>
              <textarea
                id="request"
                required
                rows={5}
                value={request}
                onChange={e => setRequest(e.target.value)}
                placeholder="Share what's on your heart…"
                className="input resize-none leading-relaxed"
              />
            </div>

            {/* Optional: opt into "someone prayed for you" texts. */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyPrayers}
                  onChange={e => setNotifyPrayers(e.target.checked)}
                  className="mt-0.5 accent-sage-600 w-4 h-4 shrink-0"
                />
                <span className="text-sm text-ink-600 leading-relaxed">
                  Text me when people pray for my request{' '}
                  <span className="text-ink-300">(optional)</span>
                </span>
              </label>

              {notifyPrayers && (
                <div className="mt-3 animate-breathe">
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(206) 555-0123"
                    className="input"
                    aria-label="Mobile number"
                  />
                  <p className="text-xs text-ink-300 leading-relaxed mt-2">
                    We&rsquo;ll text you at most once a day when people pray for
                    your request. Message and data rates may apply. Reply{' '}
                    <strong>STOP</strong> to opt out, <strong>HELP</strong> for
                    help. See our{' '}
                    <a href="/privacy-policy.html" className="underline hover:text-ink-500">
                      Privacy Policy
                    </a>{' '}
                    and{' '}
                    <a href="/terms.html" className="underline hover:text-ink-500">
                      Terms
                    </a>
                    .
                  </p>
                </div>
              )}
            </div>

            {/* Honeypot: hidden from real users, catches bots. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden="true"
            />

            {state === 'error' && (
              <p className="text-sm text-red-500/80 animate-breathe">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={state === 'loading'}
              className="btn btn-primary w-full py-3 text-sm font-medium disabled:opacity-50"
            >
              {state === 'loading' ? 'Sending…' : 'Send prayer request'}
            </button>
          </form>
        )}

        {/* Texting info + required SMS disclosures. Public by design — this is
            the consent/CTA evidence page referenced in our A2P 10DLC campaign
            registration (see message_flow). */}
        <div
          className="card p-6 sm:p-8 mt-6 animate-rise text-center"
          style={{ animationDelay: '0.2s' }}
        >
          <h2 className="font-display text-lg font-light text-ink-800 mb-2">
            Prefer to text?
          </h2>
          <p className="text-sm text-ink-500 leading-relaxed">
            Text your prayer request to{' '}
            <span className="text-ink-700 font-medium">(206) 888-6649</span>.
            You&rsquo;ll get a reply confirming we received it, and our prayer
            team may follow up with a personal response.
          </p>
          <p className="text-xs text-ink-300 leading-relaxed mt-4">
            By texting Redemption Church Seattle, you agree to receive a
            confirmation reply and, if requested, a follow-up response.
            Message frequency varies. Message and data rates may apply.
            Reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for
            help, or <strong>REMOVE</strong> to delete your prayer request
            data. See our{' '}
            <a href="/privacy-policy.html" className="underline hover:text-ink-500">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/terms.html" className="underline hover:text-ink-500">
              Terms of Service
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
