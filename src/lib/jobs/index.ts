import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { eventsRefreshJob } from '@/app/(site)/events/_lib/jobs/events-refresh'
import { authCleanupJob } from './auth-cleanup'

/**
 * Background job registry. Jobs run in the pg-boss worker (src/worker.ts) on
 * their cron schedule; every execution is recorded as a `JobRun` row, shown at
 * /admin/jobs.
 *
 * Adding a job: export a `Job` (an area keeps it in its own `_lib/jobs/`) and
 * add it to `JOBS`. No worker or deploy changes needed.
 */
export interface Job {
  /** Stable identifier — pg-boss queue name and JobRun.job. Never rename. */
  name: string
  /** Cron schedule (UTC), e.g. '0 3 * * *' daily. */
  cron: string
  /**
   * Execute and return a summary (stored on the JobRun). A non-empty `failed`
   * array marks the run 'partial'. `data` is a manual trigger's payload (cron
   * runs pass none); each job must tolerate garbage there.
   */
  run(data?: Record<string, unknown>): Promise<Record<string, unknown>>
}

export const JOBS: Job[] = [authCleanupJob, eventsRefreshJob]

/** Run a job wrapped in a JobRun record. Never throws — failures are recorded. */
export async function executeJob(job: Job, data?: Record<string, unknown>): Promise<void> {
  const run = await prisma.jobRun.create({ data: { job: job.name, status: 'running' } })
  try {
    let summary = await job.run(data)
    if (data && Object.keys(data).length > 0) summary = { ...summary, filter: data }
    const failed = Array.isArray(summary.failed) ? summary.failed.length : 0
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: failed > 0 ? 'partial' : 'success', finishedAt: new Date(), summary: summary as Prisma.InputJsonValue },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[job] ${job.name} failed`, err)
    await prisma.jobRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), summary: { error } } })
  }
}
