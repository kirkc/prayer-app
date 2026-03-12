'use client'

import { useState } from 'react'

type State = 'idle' | 'loading' | 'success' | 'error'

export default function HomePage() {
  const [name, setName] = useState('')
  const [request, setRequest] = useState('')
  const [state, setState] = useState<State>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setErrorMsg('')

    const res = await fetch('/api/prayers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || null, request }),
    })

    if (res.ok) {
      setState('success')
      setName('')
      setRequest('')
    } else {
      const data = await res.json()
      setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-gray-800">Prayer Requests</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Share your request and our team will pray for you.
            <br />
            You can also text us directly.
          </p>
        </div>

        {state === 'success' ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="text-4xl mb-3">🙏</div>
            <h2 className="text-lg font-medium text-gray-800 mb-1">Thank you</h2>
            <p className="text-sm text-gray-500 mb-5">
              We received your prayer request and will be praying for you.
            </p>
            <button
              onClick={() => setState('idle')}
              className="text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Submit another request
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col gap-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="name">
                Your name{' '}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="First name or leave blank"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="request">
                Prayer request <span className="text-red-400">*</span>
              </label>
              <textarea
                id="request"
                required
                rows={5}
                value={request}
                onChange={e => setRequest(e.target.value)}
                placeholder="Share what's on your heart…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            {state === 'error' && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={state === 'loading'}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {state === 'loading' ? 'Submitting…' : 'Submit prayer request'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
