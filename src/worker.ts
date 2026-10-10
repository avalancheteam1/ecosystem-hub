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

import { PgBoss } from 'pg-boss'
import { prisma } from '@/lib/db'
import { JOBS, executeJob } from '@/lib/jobs'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')

  const boss = new PgBoss(connectionString)
  boss.on('error', (err) => console.error('[pg-boss]', err))
  await boss.start()

  // Runs still 'running' after the 1h pg-boss expiry died with a previous worker.
  const orphaned = await prisma.jobRun.updateMany({
    where: { status: 'running', startedAt: { lt: new Date(Date.now() - 3600_000) } },
    data: { status: 'failed', finishedAt: new Date(), summary: { error: 'Interrupted (worker stopped mid-run)' } },
  })
  if (orphaned.count > 0) console.warn(`[worker] marked ${orphaned.count} interrupted run(s) as failed`)

  for (const job of JOBS) {
    await boss.createQueue(job.name)
    // A job may run up to 1h before pg-boss retries it (default 15 min).
    // updateQueue, not createQueue options: createQueue never touches an existing queue.
    await boss.updateQueue(job.name, { expireInSeconds: 3600 })
    await boss.schedule(job.name, job.cron, null, { tz: 'UTC' })
    await boss.work(job.name, async (jobs) => {
      console.log(`[worker] running ${job.name}`)
      await executeJob(job, (jobs[0]?.data ?? undefined) as Record<string, unknown> | undefined)
      console.log(`[worker] finished ${job.name}`)
    })
  }

  console.log(`[worker] started - ${JOBS.map((j) => `${j.name} (${j.cron})`).join(', ')}`)

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} - shutting down`)
    await boss.stop({ graceful: true, timeout: 30_000 })
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[worker] fatal', err)
  process.exit(1)
})
