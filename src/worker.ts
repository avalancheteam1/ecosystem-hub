import { logger } from '@/lib/logger'
/**
 * Background worker - a plain Node entrypoint, deliberately outside Next.js.
 *
 * Deployed as a second Railway service from the same Docker image (start
 * command `node /worker/worker.mjs`, see railway.worker.toml). pg-boss uses the
 * app's Postgres: it creates and migrates its own `pgboss` schema on start
 * (Prisma never sees it), schedules each registered job by its cron, and
 * guarantees single execution even with multiple worker replicas.
 *
 * Job registry + JobRun bookkeeping live in src/lib/jobs.
 */

import * as Sentry from '@sentry/node'
import { PgBoss } from 'pg-boss'
import { prisma } from '@/lib/db'
import { JOBS, executeJob } from '@/lib/jobs'
import { captureError, sentryServerOptions } from '@/lib/monitoring'
import { safeErrorMessage } from '@/lib/sentry-scrub'
import { sendSystemAlert } from '@/lib/system-alert'

// GlitchTip (errors only); a no-op without SENTRY_DSN. 'strict': an unhandled rejection still
// crashes the worker, as it does without Sentry (the SDK's default 'warn' would keep it running).
const sentryOptions = sentryServerOptions()
if (sentryOptions) {
  Sentry.init({
    ...sentryOptions,
    integrations: (defaults) => [
      ...defaults.filter((i) => i.name !== 'ProcessSession' && i.name !== 'OnUnhandledRejection'),
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
  })
}

// Liveness ping for an external monitor. Pinged after every run, failed ones too:
// it answers "is the worker alive", failed jobs already alert through executeJob.
function heartbeat() {
  const url = process.env.HEARTBEAT_URL
  if (!url) return
  void fetch(url, { signal: AbortSignal.timeout(5_000) }).catch((err) => logger.warn({ err }, '[worker] heartbeat failed'))
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const boss = new PgBoss(connectionString)
  boss.on('error', (err) => {
    logger.error({ err }, '[pg-boss]')
    captureError(err, { tags: { source: 'pg-boss' } })
  })
  await boss.start()

  // Runs still 'running' after the 1h pg-boss expiry died with a previous worker.
  const orphaned = await prisma.jobRun.updateMany({
    where: { status: 'running', startedAt: { lt: new Date(Date.now() - 3600_000) } },
    data: { status: 'failed', finishedAt: new Date(), summary: { error: 'Interrupted (worker stopped mid-run)' } },
  })
  if (orphaned.count > 0) {
    logger.warn(`[worker] marked ${orphaned.count} interrupted run(s) as failed`)
    void sendSystemAlert({ title: 'Jobs interrupted', message: `${orphaned.count} run(s) died with a previous worker. See /admin/jobs`, priority: 3 })
  }

  for (const job of JOBS) {
    await boss.createQueue(job.name)
    // A job may run up to 1h before pg-boss retries it (default 15 min).
    // updateQueue, not createQueue options: createQueue never touches an existing queue.
    await boss.updateQueue(job.name, { expireInSeconds: 3600 })
    await boss.schedule(job.name, job.cron, null, { tz: 'UTC' })
    await boss.work(job.name, async (jobs) => {
      logger.info(`[worker] running ${job.name}`)
      await executeJob(job, (jobs[0]?.data ?? undefined) as Record<string, unknown> | undefined)
      heartbeat()
      logger.info(`[worker] finished ${job.name}`)
    })
  }

  logger.info(`[worker] started - ${JOBS.map((j) => `${j.name} (${j.cron})`).join(', ')}`)

  const shutdown = async (signal: string) => {
    logger.info(`[worker] ${signal} - shutting down`)
    await boss.stop({ graceful: true, timeout: 30_000 })
    await Sentry.flush(2_000)
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch(async (err) => {
  logger.fatal({ err }, '[worker] fatal')
  captureError(err, { tags: { source: 'worker-fatal' } })
  // Without this the worker dies silently and all scheduled jobs just stop.
  // Awaited (max 5s): process.exit would kill an un-awaited request.
  await Promise.all([
    sendSystemAlert({ title: 'Worker crashed', message: safeErrorMessage(err), priority: 5 }),
    Sentry.flush(2_000), // resolves at once when GlitchTip is off
  ])
  process.exit(1)
})
