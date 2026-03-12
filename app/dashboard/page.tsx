import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import PrayerList from '@/components/PrayerList'
import SignOutButton from '@/components/SignOutButton'
import { PrayerRequest } from '@/types'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: prayers } = await supabase
    .from('prayer_requests')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">Prayer Requests</h1>
            <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
          </div>
          <SignOutButton />
        </div>

        <PrayerList
          initialPrayers={(prayers ?? []) as PrayerRequest[]}
          initialStatus="active"
        />
      </div>
    </main>
  )
}
