import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as unknown,
  transaction: vi.fn(),
  updateMany: vi.fn(),
  auditLogCreate: vi.fn(),
  findUnique: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => state.user }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: state.revalidatePath }))
vi.mock('@/lib/db', () => ({ prisma: { $transaction: state.transaction } }))

import { createBountyDraft, saveBountyDraft, setBountyPublication } from '@/app/(site)/earn/_lib/actions'

const publisher = { id: 'test-user', isSuperAdmin: false, permissions: new Set(['earn.publish']) }
const id = '83a2f90c-8226-400c-8df0-19fe4827db49'
const draft = {
  title: 'Public listing', description: 'Description', deliverables: 'Deliverables', participation: 'Instructions',
  participationUrl: null, category: 'Development' as const, reward: 'Mentorship', deadline: '2027-01-03T18:00:00.000Z',
  hubModule: null, githubIssueUrl: null,
}
const publish = { id, revision: 1, publish: true }
const tx = { $queryRaw: vi.fn(async () => []), earnBounty: { findUnique: state.findUnique, updateMany: state.updateMany }, auditLog: { create: state.auditLogCreate } }

describe('native Earn publishing boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.user = null
    state.transaction.mockImplementation(async (write) => write(tx))
  })

  it('rejects anonymous and ungranted callers before all three action handlers', async () => {
    expect(await createBountyDraft({ id, draft })).toEqual({ ok: false, error: 'Not signed in' })
    state.user = { ...publisher, permissions: new Set(['users.view']) }
    expect(await createBountyDraft({ id, draft })).toEqual({ ok: false, error: 'Forbidden' })
    expect(await saveBountyDraft({ id, revision: 1, draft })).toEqual({ ok: false, error: 'Forbidden' })
    expect(await setBountyPublication(publish)).toEqual({ ok: false, error: 'Forbidden' })
    expect(state.transaction).not.toHaveBeenCalled()
  })

  it('requires the expected revision and audits a successful publication in the write transaction', async () => {
    state.user = publisher
    state.findUnique.mockResolvedValue({ publishedAt: null, deadline: new Date(Date.now() + 60_000) })
    state.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    expect(await setBountyPublication(publish)).toMatchObject({ ok: false })
    expect(state.auditLogCreate).not.toHaveBeenCalled()
    expect(state.revalidatePath).not.toHaveBeenCalled()
    expect(await setBountyPublication(publish)).toEqual({ ok: true, data: { id } })
    expect(state.updateMany).toHaveBeenLastCalledWith({
      where: { id, revision: 1, deadline: { gt: expect.any(Date) } },
      data: { publishedAt: expect.any(Date), revision: { increment: 1 } },
    })
    expect(state.auditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: publisher.id, action: 'earn.listing.publish', entityId: id }),
    })
  })
})
