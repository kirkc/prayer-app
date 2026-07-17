import { NextRequest, NextResponse } from 'next/server'
import { getSuperAdminUser } from '@/lib/admin'
import { runCronJob } from '@/lib/cron-jobs'
import type { CronJobName } from '@/types'

type Params = { params: Promise<{ job: string }> }

const JOBS: CronJobName[] = ['notifications', 'prayer-updates']

// POST /api/super/cron/[job] — run a scheduled job on demand. Super admin
// only. The run is recorded in cron_runs with trigger 'manual'.
export async function POST(_req: NextRequest, { params }: Params) {
  const user = await getSuperAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job } = await params
  if (!JOBS.includes(job as CronJobName)) {
    return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
  }

  try {
    const summary = await runCronJob(job as CronJobName, 'manual', user.id)
    return NextResponse.json({ ok: true, ...summary })
  } catch {
    return NextResponse.json({ error: 'Job failed' }, { status: 500 })
  }
}
