import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getOrgBySlug } from '@/lib/orgs'
import { submitPrayer, preflightResponse } from '@/lib/prayer-submit'

type Params = { params: Promise<{ slug: string }> }

// Public per-church prayer submission. The slug in the path resolves the org
// (the request body can't be trusted for tenancy, and the CORS preflight has
// no body at all).

export async function OPTIONS(req: NextRequest, { params }: Params) {
  const { slug } = await params
  const org = await getOrgBySlug(createServiceClient(), slug).catch(() => null)
  return preflightResponse(req, org)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { slug } = await params
  let org
  try {
    org = await getOrgBySlug(createServiceClient(), slug)
  } catch {
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }
  if (!org) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  return submitPrayer(req, org)
}
