import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// GET /api/prayers - list approved prayer requests
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*')
    .eq('is_approved', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/prayers - submit a new prayer request
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, phone, request, is_anonymous } = body

  if (!request) {
    return NextResponse.json({ error: 'Prayer request is required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({ name, phone, request, is_anonymous: is_anonymous ?? false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
