import { NextRequest, NextResponse } from 'next/server'
import { runCronJob } from '@/lib/cron-jobs'

export const dynamic = 'force-dynamic'

// Vercel Cron hits this daily (see vercel.json). The job body lives in
// lib/cron-jobs.ts, shared with the super-admin "Run now" trigger.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await runCronJob('notifications', 'cron')
    return NextResponse.json({ ok: true, ...summary })
  } catch {
    return NextResponse.json({ error: 'Job failed' }, { status: 500 })
  }
}
