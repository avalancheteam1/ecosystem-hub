import { beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'

const jobRun = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { jobRun } }))

import { executeJob, type Job } from '@/lib/jobs'

beforeEach(() => {
  jobRun.create.mockReset().mockResolvedValue({ id: 'run1' })
  jobRun.update.mockReset().mockResolvedValue({})
})

const job = (run: Job['run']): Job => ({ name: 't', cron: '* * * * *', run })
const lastUpdate = () => jobRun.update.mock.calls.at(-1)![0].data

test('a successful run is recorded with its summary', async () => {
  await executeJob(job(async () => ({ deleted: 3 })))
  assert.equal(lastUpdate().status, 'success')
  assert.deepEqual(lastUpdate().summary, { deleted: 3 })
})

test('a summary with failed items is recorded as partial', async () => {
  await executeJob(job(async () => ({ failed: ['x'] })))
  assert.equal(lastUpdate().status, 'partial')
})

test('a throwing job is recorded as failed and executeJob still resolves', async () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  await executeJob(job(async () => { throw new Error('boom') }))
  assert.equal(lastUpdate().status, 'failed')
  assert.deepEqual(lastUpdate().summary, { error: 'boom' })
  spy.mockRestore()
})

test('a manual payload is stored on the summary', async () => {
  await executeJob(job(async () => ({ ok: 1 })), { only: 'a' })
  assert.deepEqual(lastUpdate().summary, { ok: 1, filter: { only: 'a' } })
})
