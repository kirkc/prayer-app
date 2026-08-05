import type { SupabaseClient } from '@supabase/supabase-js'

// Organization lookups. The organizations table is service-role only (RLS on,
// zero policies — migration 012), so every helper here takes the service
// client explicitly. Callers resolve the org once per request and pass it
// down; nothing below the route layer re-fetches it.

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

// The founding org. Until the multi-org form routes ship, unattributed ingest
// (the legacy public form) belongs to Redemption — the only org that existed
// when those entry points were built.
export const DEFAULT_ORG_SLUG = 'redemption'

// All orgs, for cron jobs that fan out per church.
export async function getAllOrgs(service: SupabaseClient): Promise<Org[]> {
  const { data } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .order('created_at')
  return (data as Org[] | null) ?? []
}

export async function getOrgBySlug(
  service: SupabaseClient,
  slug: string
): Promise<Org | null> {
  const { data } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('slug', slug)
    .single()
  return (data as Org | null) ?? null
}

export async function getOrgById(
  service: SupabaseClient,
  id: string
): Promise<Org | null> {
  const { data } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('id', id)
    .single()
  return (data as Org | null) ?? null
}

// Inbound SMS is attributed by the number the requester texted (the webhook's
// `To` param) — each org's Twilio number is unique, so this is the tenant key
// for the SMS ingest path.
export async function getOrgByTwilioPhone(
  service: SupabaseClient,
  phone: string
): Promise<Org | null> {
  const { data } = await service
    .from('organizations')
    .select(ORG_COLUMNS)
    .eq('twilio_phone', phone)
    .single()
  return (data as Org | null) ?? null
}

export async function getOrgForUser(
  service: SupabaseClient,
  userId: string
): Promise<Org | null> {
  const { data } = await service
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single()
  if (!data?.org_id) return null
  return getOrgById(service, data.org_id as string)
}
