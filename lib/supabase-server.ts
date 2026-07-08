import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Server client — use in server components and API routes.
// Read-only: session refresh/persistence is proxy.ts's job. If this client
// wrote refreshed cookies back on every call, route handlers like
// /api/prayers would emit Set-Cookie for the auth cookies on plain reads
// (e.g. every filter-tab fetch), which password managers mistake for a
// fresh login and prompt to save.
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
}

// Service-role client — bypasses RLS, use only in trusted API routes
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
