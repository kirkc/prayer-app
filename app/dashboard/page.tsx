import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getPrayerFeed } from '@/lib/prayers'
import PrayerList from '@/components/PrayerList'
import SignOutButton from '@/components/SignOutButton'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [prayers, { data: profile }] = await Promise.all([
    getPrayerFeed(supabase, user.id, { status: 'active' }),
    supabase.from('profiles').select('role, display_name').eq('id', user.id).single(),
  ])

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between mb-10 animate-rise">
          <div>
            <h1 className="font-display text-3xl font-light text-ink-800">
              Prayer requests
            </h1>
            <p className="text-sm text-ink-400 mt-1.5">
              {profile?.display_name ?? user.email}
            </p>
          </div>
          <div className="flex items-center gap-5 text-sm">
            {profile?.role === 'admin' && (
              <Link
                href="/admin"
                className="text-ink-400 hover:text-ink-600 transition-colors duration-300"
              >
                Admin
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>

        <PrayerList initialPrayers={prayers} initialStatus="active" />
      </div>
    </main>
  )
}
