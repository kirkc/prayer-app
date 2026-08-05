import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'

export type Role = 'prayer' | 'admin' | 'super_admin'

// The signed-in caller plus the profile facts routes act on. org_id scopes
// every admin surface to the caller's own church; role gates the tier.
export type MemberContext = {
  user: User
  role: Role
  orgId: string
}

// Server-side role + org lookup. Both live in the database, so a client can't
// spoof them.
async function getUserWithRole(): Promise<MemberContext | null> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) return null
  return { user, role: profile.role as Role, orgId: profile.org_id as string }
}

// Any signed-in team member, with their role and org.
export async function getMemberContext(): Promise<MemberContext | null> {
  return getUserWithRole()
}

// Admins and above, with their org for scoping admin queries.
export async function getAdminContext(): Promise<MemberContext | null> {
  const found = await getUserWithRole()
  if (!found) return null
  return found.role === 'admin' || found.role === 'super_admin' ? found : null
}

// Returns the user only for super admins — the operations tier (error log,
// message log, cron controls, requester management, member settings).
export async function getSuperAdminUser(): Promise<User | null> {
  const found = await getUserWithRole()
  return found?.role === 'super_admin' ? found.user : null
}
