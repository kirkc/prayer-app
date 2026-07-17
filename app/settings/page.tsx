import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import NotificationSettings from '@/components/NotificationSettings'
import AccountSettings from '@/components/AccountSettings'
import type { NotifyFrequency } from '@/types'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('notify_new_requests, notify_frequency')
    .eq('id', user.id)
    .single()

  const enabled = profile?.notify_new_requests ?? true
  const frequency = (profile?.notify_frequency ?? 'immediate') as NotifyFrequency

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">Settings</h1>
            <p className="text-sm text-ink-400 mt-1.5">How you hear about prayer requests</p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-ink-400 hover:text-ink-600 transition-colors duration-300"
          >
            Back to requests
          </Link>
        </div>

        <section className="mb-10 animate-rise" style={{ animationDelay: '0.05s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Notifications</h2>
          <NotificationSettings initialEnabled={enabled} initialFrequency={frequency} />
        </section>

        <section className="animate-rise" style={{ animationDelay: '0.1s' }}>
          <h2 className="font-display text-xl font-light text-ink-800 mb-4">Account</h2>
          <AccountSettings email={user.email ?? ''} />
        </section>
      </div>
    </main>
  )
}
