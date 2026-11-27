import { test, vi } from 'vitest'
import { logger } from '@/lib/logger'
import assert from 'node:assert/strict'

const { create, createMany } = vi.hoisted(() => ({ create: vi.fn(), createMany: vi.fn() }))
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create, createMany } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'cf-connecting-ip': '1.2.3.4' }) }))

import { diffObjects, recordAudit, recordAudits } from '@/lib/audit'

test('diff keeps only changed keys, comparing nested values by content', () => {
  const d = diffObjects({ a: 1, b: [1, 2], c: 'x' }, { a: 1, b: [1, 3], d: true })
  assert.deepEqual(d, { before: { b: [1, 2], c: 'x', d: null }, after: { b: [1, 3], c: null, d: true } })
})

test('recordAudit stores the diff and the request ip', async () => {
  create.mockResolvedValueOnce({})
  await recordAudit({ actorId: 'u1', action: 'role.update', entityType: 'Role', entityId: 'r1', before: { label: 'A', x: 1 }, after: { label: 'B', x: 1 } })
  const data = create.mock.calls[0]![0].data
  assert.deepEqual([data.before, data.after, data.ip], [{ label: 'A' }, { label: 'B' }, '1.2.3.4'])
})

test('recordAudit never throws', async () => {
  create.mockRejectedValueOnce(new Error('db down'))
  const spy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  await recordAudit({ actorId: null, action: 'x', entityType: 'Y' })
  assert.equal(spy.mock.calls.length, 1)
  spy.mockRestore()
})

test('recordAudits writes all entries in one insert, diffed, with the request ip', async () => {
  createMany.mockResolvedValueOnce({ count: 2 })
  await recordAudits([
    { actorId: 'u1', action: 'p.approve', entityType: 'Participant', entityId: 'p1', before: { status: 'pending' }, after: { status: 'active' } },
    { actorId: 'u1', action: 'p.approve', entityType: 'Participant', entityId: 'p2', before: { status: 'pending', n: 1 }, after: { status: 'active', n: 1 } },
  ])
  assert.equal(createMany.mock.calls.length, 1)
  const rows = createMany.mock.calls[0]![0].data
  assert.deepEqual(rows.map((r: { entityId: string; after: unknown; ip: string }) => [r.entityId, r.after, r.ip]), [['p1', { status: 'active' }, '1.2.3.4'], ['p2', { status: 'active' }, '1.2.3.4']])
  await recordAudits([])
  assert.equal(createMany.mock.calls.length, 1)
})

test('recordAudits never throws', async () => {
  createMany.mockRejectedValueOnce(new Error('db down'))
  const spy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  await recordAudits([{ actorId: null, action: 'x', entityType: 'Y' }])
  assert.equal(spy.mock.calls.length, 1)
  spy.mockRestore()
})
