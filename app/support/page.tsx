import Link from 'next/link'

// Public support page. Required by App Store Connect (every listing needs a
// Support URL) and it doubles as the published contact point App Review looks
// for when an app displays content other people wrote.
export const metadata = { title: 'Support' }

const SUPPORT_EMAIL = 'interprayapp@gmail.com'

export default function SupportPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="mb-10 animate-rise">
          <h1 className="font-display text-3xl font-light text-ink-800">Support</h1>
          <p className="text-sm text-ink-400 mt-1.5">Help with the Prayer Team app</p>
        </div>

        <div className="card p-8 sm:p-10 animate-rise flex flex-col gap-6 text-sm text-ink-600 leading-relaxed" style={{ animationDelay: '0.05s' }}>
          <p>
            Prayer Team is the private app a church&rsquo;s prayer team uses to
            read the requests their congregation has shared, mark that
            they&rsquo;ve prayed, and — where the church has it enabled — reply
            by text. If something isn&rsquo;t working, write to us at{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-ink-500">
              {SUPPORT_EMAIL}
            </a>
            . We answer within one business day.
          </p>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Getting an account</h2>
            <p>
              There is no public sign-up. Your church&rsquo;s prayer team
              administrator creates your account and emails you an invitation
              link to set a password. If you serve on a prayer team and
              don&rsquo;t have access yet, ask your administrator to invite you
              — we can&rsquo;t add you to a church ourselves.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Signing in</h2>
            <p>
              Sign in with the email address your church invited, and the
              password you chose. Forgot it? Open <strong>Settings</strong> in
              the app (the person icon, top right) and tap{' '}
              <strong>Send password reset email</strong>, or ask your
              administrator to send you a fresh link.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Notifications</h2>
            <p>
              Settings controls how you hear about new requests: a push
              notification, an email digest, or neither. If push notifications
              never arrive, check that they&rsquo;re allowed for Prayer Team in
              your device&rsquo;s Settings app as well.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Deleting your account</h2>
            <p>
              Open <strong>Settings</strong> in the app and tap{' '}
              <strong>Delete my account</strong>. This permanently removes your
              account, your name and email, your notification preferences, and
              the record of which requests you prayed for. It happens
              immediately and can&rsquo;t be undone. Prayer requests the
              congregation submitted belong to the church and stay with it.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Reporting a request</h2>
            <p>
              Prayer requests are written by members of the congregation. If one
              is abusive, unlawful, or otherwise shouldn&rsquo;t be there, swipe
              it in the feed to mark it <strong>Spam</strong> — that pulls it out
              of the active list for everyone on your team. For anything that
              needs our attention, email{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="underline hover:text-ink-500">
                {SUPPORT_EMAIL}
              </a>{' '}
              and we&rsquo;ll respond within one business day.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Someone in danger</h2>
            <p>
              This app is not a counseling, medical, or emergency service. If a
              request describes someone in immediate danger, call{' '}
              <strong>911</strong>. For a mental health crisis, call or text{' '}
              <strong>988</strong> (Suicide &amp; Crisis Lifeline) any time.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg font-light text-ink-800 mb-2">Privacy and terms</h2>
            <p>
              See the{' '}
              <Link href="/legal/privacy" className="underline hover:text-ink-500">
                Privacy Policy
              </Link>{' '}
              for what&rsquo;s collected and how it&rsquo;s handled, and the{' '}
              <Link href="/legal/terms" className="underline hover:text-ink-500">
                Terms of Service
              </Link>{' '}
              for the ground rules.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
