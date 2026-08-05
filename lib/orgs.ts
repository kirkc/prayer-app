import type { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/log'

// Organization lookups. The organizations table is service-role only (RLS on,
// zero policies — migration 012), so every helper here takes the service
// client explicitly. Callers resolve the org once per request and pass it
// down; nothing below the route layer re-fetches it.
//
// Error semantics: "no such org" returns null; a real query failure (outage,
// bad connection) logs and THROWS so callers can't mistake a database hiccup
// for a missing org — the SMS webhook in particular must return 5xx (Twilio
// retries) rather than silently dropping a text as an unknown number.

export type Org = {
  id: string
  slug: string
  name: string
  timezone: string
  twilio_phone: string | null
  from_email: string | null
  reply_to: string | null
  allowed_origins: string[]
}

const ORG_COLUMNS =
  'id, slug, name, timezone, twilio_phone, from_email, reply_to, allowed_origins'

// PostgREST's "zero rows for .single()" code — the one error that means
// "not found" rather than "query failed".
const NO_ROWS = 'PGRST116'

// The founding org. Until the multi-org form routes ship, unattributed ingest
// (the legacy public form) belongs to Redemption — the only org that existed
// when those entry points were built.
export const DEFAULT_ORG_SLUG = 'redemption'

async function findOrg(
  service: SupabaseClient,
  column: 'slug' | 'id' | 'twilio_phone',
  value: string
): Promise<Org | null> {
  const { data, error } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq(column, value)
    .single()
  if (error && error.code !== NO_ROWS) {
    await logError('orgs.lookup', error, { column, value })
    throw error
  }
  return (data as Org | null) ?? null
}

// All orgs, for cron jobs that fan out per church. Throws on failure — a
// silent [] would make a DB outage look like "no orgs configured" and let a
// cron run record ok:true while doing nothing.
export async function getAllOrgs(service: SupabaseClient): Promise<Org[]> {
  const { data, error } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .order('created_at')
  if (error) {
    await logError('orgs.list', error)
    throw error
  }
  return (data as Org[] | null) ?? []
}

export async function getOrgBySlug(
  service: SupabaseClient,
  slug: string
): Promise<Org | null> {
  return findOrg(service, 'slug', slug)
}

export async function getOrgById(
  service: SupabaseClient,
  id: string
): Promise<Org | null> {
  return findOrg(service, 'id', id)
}

// Inbound SMS is attributed by the number the requester texted (the webhook's
// `To` param) — each org's Twilio number is unique, so this is the tenant key
// for the SMS ingest path.
export async function getOrgByTwilioPhone(
  service: SupabaseClient,
  phone: string
): Promise<Org | null> {
  return findOrg(service, 'twilio_phone', phone)
}

export async function getOrgForUser(
  service: SupabaseClient,
  userId: string
): Promise<Org | null> {
  const { data, error } = await service
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single()
  if (error && error.code !== NO_ROWS) {
    await logError('orgs.lookup', error, { column: 'profiles.id', value: userId })
    throw error
  }
  if (!data?.org_id) return null
  return getOrgById(service, data.org_id as string)
}
