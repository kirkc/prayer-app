import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'

export type Role = 'prayer' | 'admin' | 'super_admin'

// Server-side role lookup. Role lives in the database, so a client can't
// spoof it.
async function getUserWithRole(): Promise<{ user: User; role: Role } | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return null
  return { user, role: profile.role as Role }
}

// Returns the user if they are signed in AND an admin or super admin;
// otherwise null. Super admins can do everything admins can.
export async function getAdminUser(): Promise<User | null> {
  const found = await getUserWithRole()
  if (!found) return null
  return found.role === 'admin' || found.role === 'super_admin' ? found.user : null
}

// Returns the user only for super admins — the operations tier (error log,
// message log, cron controls, requester management, member settings).
export async function getSuperAdminUser(): Promise<User | null> {
  const found = await getUserWithRole()
  return found?.role === 'super_admin' ? found.user : null
}
