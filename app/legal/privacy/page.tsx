// Platform-generic privacy policy for churches using the shared prayer tool.
// Redemption keeps its own registered pages (public/privacy-policy.html);
// a church that later adds SMS needs its own pages for A2P registration —
// see docs/new-org-runbook.md.
export const metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-10 animate-rise">
          <h1 className="font-display text-3xl font-light text-ink-800">Privacy Policy</h1>
          <p className="text-sm text-ink-400 mt-1.5">How prayer requests are handled</p>
        </div>

        <div className="card p-8 sm:p-10 animate-rise flex flex-col gap-6 text-sm text-ink-600 leading-relaxed" style={{ animationDelay: '0.05s' }}>
          <p>
            This site lets you share a prayer request with a church&rsquo;s prayer
            team. It is operated as a shared tool used by more than one church;
            your request goes only to the prayer team of the church whose page
            you submitted it on.
          </p>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">What we collect</h2>
            <p>
              Only what you type into the form: your prayer request, your first
              name if you choose to give it, and — only if you opt in on a
              church that offers text updates — a mobile number. Nothing else is
              collected, and there is no tracking for advertising.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">How it&rsquo;s used</h2>
            <p>
              Your request is shown to that church&rsquo;s prayer team so they can
              pray for you and, if you shared a number, occasionally text you —
              to let you know people have prayed, or to send a personal
              response. Your phone number is never shown to the team in the
              app, never shared with other churches, and never sold or used
              for marketing.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Texting</h2>
            <p>
              If a church offers text updates and you opted in: message
              frequency varies, message and data rates may apply, and you can
              reply <strong>STOP</strong> at any time to stop receiving texts,{' '}
              <strong>HELP</strong> for help, or <strong>REMOVE</strong> to have
              your prayer request data deleted.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Deletion</h2>
            <p>
              You can ask for your request and any stored contact details to be
              deleted at any time — text <strong>REMOVE</strong> (where texting
              is offered) or ask the church&rsquo;s prayer team, and it will be
              removed from our records.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Questions</h2>
            <p>
              Reach out to the church whose page you used — they can answer
              questions about their prayer team or pass along anything about
              how this site works.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
