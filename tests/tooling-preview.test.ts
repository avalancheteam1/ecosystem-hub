import assert from 'node:assert/strict'
import { beforeEach, test, vi } from 'vitest'
import { listPublicToolPreview, listPublicTools } from '@/app/(site)/tooling/_lib/queries'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: { toolingListing: { findMany } } }))

const rows = Array.from({ length: 13 }, (_, i) => ({ project: { slug: `tool-${i}` }, approvedVersion: { name: `Tool ${i}`, shortDescription: '', logoUrl: null } }))

beforeEach(() => {
  findMany.mockReset()
  findMany.mockImplementation(({ skip = 0, take }) => rows.slice(skip, skip + take))
})

test('preview sends the catalog query with take = the visible cards', async () => {
  await listPublicToolPreview(3)
  await listPublicTools({ page: 1 })
  const [preview, catalog] = findMany.mock.calls.map((c) => c[0])
  assert.deepEqual(preview.where, catalog.where)
  assert.deepEqual(preview.orderBy, catalog.orderBy)
  assert.equal(preview.skip, 0)
  assert.equal(preview.take, 3)
})

test('the catalog pages with a lookahead row', async () => {
  const first = await listPublicTools({ page: 1 })
  const last = await listPublicTools({ page: 2 })
  assert.equal(findMany.mock.calls[1][0].skip, 12)
  assert.equal(findMany.mock.calls[1][0].take, 13)
  assert.equal(first.hasMore, true)
  assert.equal(last.hasMore, false)
  assert.deepEqual([...first.tools, ...last.tools].map((t) => t.slug), rows.map((r) => r.project.slug))
})
