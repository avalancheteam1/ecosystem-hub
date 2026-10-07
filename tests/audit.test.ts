import { test, vi } from 'vitest'
import assert from 'node:assert/strict'

const create = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ prisma: { auditLog: { create } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'cf-connecting-ip': '1.2.3.4' }) }))

import { diffObjects, recordAudit } from '@/lib/audit'

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
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  await recordAudit({ actorId: null, action: 'x', entityType: 'Y' })
  assert.equal(spy.mock.calls.length, 1)
  spy.mockRestore()
})
