import { logger } from '@/lib/logger'
import 'server-only'
import { PgBoss } from 'pg-boss'

// Send-only pg-boss client for the web app: "run now" just enqueues - the
// worker service executes. No supervision/migration here; the worker owns the
// pgboss schema (so a send fails clearly if the worker has never run).
// The start *promise* is cached so concurrent first calls share one client.
const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> }

function startBoss(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, supervise: false, migrate: false, createSchema: false, max: 2 })
  boss.on('error', (err) => logger.error({ err }, '[pg-boss send]'))
  return boss.start().then(() => boss)
}

export async function enqueueJob(name: string, data?: Record<string, unknown>): Promise<void> {
  globalForBoss.boss ??= startBoss().catch((err) => {
    globalForBoss.boss = undefined // retry on the next call
    throw err
  })
  await (await globalForBoss.boss).send(name, data ?? {})
}
