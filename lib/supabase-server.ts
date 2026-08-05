import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

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

export type ApiContext = { supabase: SupabaseClient; user: User | null }

// Auth context for member-facing API routes: a native client (the iOS app)
// sends `Authorization: Bearer <access token>` — supabase-swift refreshes the
// token on-device, the server only validates it — while the web app keeps
// using cookies. The returned client carries the caller's identity either
// way, so RLS applies identically to both.
export async function createApiContext(req: NextRequest): Promise<ApiContext> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    return { supabase, user }
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}
