import Link from 'next/link'

// Platform-generic terms for churches using the shared prayer tool.
// Redemption keeps its own registered pages (public/terms.html).
export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-10 animate-rise">
          <h1 className="font-display text-3xl font-light text-ink-800">Terms of Service</h1>
          <p className="text-sm text-ink-400 mt-1.5">Plain terms for a simple tool</p>
        </div>

        <div className="card p-8 sm:p-10 animate-rise flex flex-col gap-6 text-sm text-ink-600 leading-relaxed" style={{ animationDelay: '0.05s' }}>
          <p>
            This site exists so you can share a prayer request with a
            church&rsquo;s prayer team. By using it you agree to these terms.
          </p>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">What this is</h2>
            <p>
              A way to pass your request to real people at the church whose
              page you used, who will pray for you and may respond personally.
              It is not a counseling, medical, or emergency service. If you or
              someone else is in immediate danger, call 911; if you are in
              crisis, you can call or text <strong>988</strong> (Suicide &amp;
              Crisis Lifeline) any time.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Using the form</h2>
            <p>
              Please share only what&rsquo;s yours to share, and use the form in
              good faith — no spam, harassment, unlawful content, or requests
              on behalf of someone who wouldn&rsquo;t want their situation
              shared. Churches may remove requests at their discretion.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Texting</h2>
            <p>
              Where a church offers text updates and you opt in, you consent to
              receive those texts. Message frequency varies and message and
              data rates may apply. Reply <strong>STOP</strong> to opt out,{' '}
              <strong>HELP</strong> for help, or <strong>REMOVE</strong> to
              delete your prayer request data.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">The usual caveats</h2>
            <p>
              The service is provided as-is, without warranties, and may change
              or pause at any time. See the{' '}
              <Link href="/legal/privacy" className="underline hover:text-ink-500">
                Privacy Policy
              </Link>{' '}
              for how your information is handled.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
