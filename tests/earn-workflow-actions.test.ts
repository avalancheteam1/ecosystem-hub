import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as unknown, tx: vi.fn(), lock: vi.fn(), bounty: vi.fn(), entry: vi.fn(), count: vi.fn(),
  audit: vi.fn(), update: vi.fn(), review: vi.fn(), award: vi.fn(), complete: vi.fn(), selected: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/db', () => ({ prisma: { $transaction: mocks.tx } }))

import { announceAwards, cancelEarnBounty, reviewStage, reviseStage } from '@/app/(site)/earn/_lib/workflow-actions'

const bountyId = '83a2f90c-8226-400c-8df0-19fe4827db49'
const id = '17f149fa-6932-4c27-85f5-096379ba4db6'
const stageId = '4f1a1aff-0e83-47df-b238-58c04948beac'
const reviewer = { id: 'staff', isSuperAdmin: false, permissions: new Set(['earn.review']) }
const entry = { status: 'pending', revision: 2, version: 4, stageId, contributorId: 'contributor' }
const review = { id, bountyId, version: 4, decision: 'approved' as const, feedback: 'Visible later', internalNote: 'Staff only' }
const bounty = {
  deadline: new Date(0), terms: 'Current terms', termsVersion: 3, reward: 'Mentorship', resultsAnnouncedAt: null, revision: 5,
  stages: [{ id: stageId, position: 1, title: 'Final work', approvalLimit: 1, submissionPolicy: 'resubmit', requiresPullRequest: false }],
}

describe('Earn action boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.user = reviewer
    mocks.tx.mockImplementation(async (execute) => execute({
      $queryRaw: mocks.lock, earnBounty: { findUnique: mocks.bounty, update: mocks.complete },
      earnSubmission: { findUnique: mocks.entry, count: mocks.count, update: mocks.update, findMany: mocks.selected },
      earnReview: { create: mocks.review }, earnAward: { createMany: mocks.award }, auditLog: { create: mocks.audit },
    }))
    mocks.bounty.mockResolvedValue(bounty)
    mocks.entry.mockResolvedValue(entry)
  })

  it('requires finalize permission in addition to review, and grants neither through ordinary membership', async () => {
    expect(await reviewStage(review)).toEqual({ ok: false, error: 'You do not have permission to select award recipients.' })
    expect(mocks.review).not.toHaveBeenCalled()
    mocks.user = { ...reviewer, permissions: new Set(['earn.finalize']) }
    expect(await reviewStage(review)).toEqual({ ok: false, error: 'Forbidden' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects self-review, stale revisions and approvals over the stage cap', async () => {
    mocks.user = { ...reviewer, permissions: new Set(['earn.review', 'earn.finalize']) }
    mocks.entry.mockResolvedValueOnce({ ...entry, contributorId: reviewer.id })
    expect(await reviewStage(review)).toMatchObject({ ok: false })
    expect(await reviewStage({ ...review, version: 3 })).toMatchObject({ ok: false })
    mocks.count.mockResolvedValueOnce(1)
    expect(await reviewStage(review)).toMatchObject({ ok: false })
    expect(mocks.review).not.toHaveBeenCalled()
    mocks.count.mockResolvedValueOnce(0)
    expect(await reviewStage(review)).toEqual({ ok: true, data: { id } })
    expect(mocks.review).toHaveBeenCalledWith({ data: expect.objectContaining({ submissionId: id, revision: 2, internalNote: 'Staff only' }) })
    expect(mocks.complete).toHaveBeenCalledWith({ where: { id: bountyId }, data: { revision: { increment: 1 } } })
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('Staff only')
    expect(mocks.award).not.toHaveBeenCalled()
  })

  it('requires ownership for revision writes and rejects stale terms before persisting', async () => {
    mocks.user = { id: 'other', isSuperAdmin: false, permissions: new Set() }
    mocks.bounty.mockResolvedValue({ ...bounty, deadline: new Date(Date.now() + 60_000) })
    const input = { id, bountyId, version: 4, changeNote: 'Updated', evidence: { notes: 'New work', links: [], pullRequests: [], termsVersion: 2, accepted: true as const } }
    mocks.entry.mockResolvedValueOnce(null)
    expect(await reviseStage(input)).toEqual({ ok: false, error: 'This submission is unavailable.' })
    expect(mocks.entry).toHaveBeenCalledWith(expect.objectContaining({ where: { id, contributorId: 'other', stage: { bountyId } } }))
    expect(await reviseStage(input)).toEqual({ ok: false, error: 'Reload and accept the current bounty terms before submitting.' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('releases a private selection with finalize permission and invalidates the announcement confirmation', async () => {
    const remove = { ...review, decision: 'needs_review' as const, feedback: '', internalNote: 'Fix the selection' }
    mocks.entry.mockResolvedValue({ ...entry, status: 'approved' })
    expect(await reviewStage(remove)).toEqual({ ok: false, error: 'You do not have permission to select award recipients.' })
    mocks.user = { ...reviewer, permissions: new Set(['earn.review', 'earn.finalize']) }
    expect(await reviewStage({ ...remove, internalNote: '' })).toMatchObject({ ok: false })
    expect(await reviewStage(remove)).toEqual({ ok: true, data: { id } })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id }, data: { status: 'needs_review', version: { increment: 1 } } })
    expect(mocks.complete).toHaveBeenCalledWith({ where: { id: bountyId }, data: { revision: { increment: 1 } } })
    expect(mocks.award).not.toHaveBeenCalled()
  })

  it('cancels before announcement, with a protected staff reason and preserved submissions', async () => {
    const input = { id: bountyId, revision: 5, reason: 'A private reason' }
    expect(await cancelEarnBounty(input)).toEqual({ ok: false, error: 'Forbidden' })
    mocks.user = { ...reviewer, isSuperAdmin: true }
    mocks.bounty.mockResolvedValueOnce({ ...bounty, resultsAnnouncedAt: new Date() })
    expect(await cancelEarnBounty(input)).toMatchObject({ ok: false })
    expect(await cancelEarnBounty(input)).toEqual({ ok: true, data: { id: bountyId } })
    expect(mocks.complete).toHaveBeenCalledWith({ where: { id: bountyId }, data: { publishedAt: null, cancelledAt: expect.any(Date), cancellationReason: input.reason, revision: { increment: 1 } } })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(input.reason)
  })

  it('creates awards only on an explicit current announcement and rejects a second announcement', async () => {
    mocks.user = { ...reviewer, isSuperAdmin: true }
    mocks.selected.mockResolvedValueOnce([{ id }])
    expect(await announceAwards({ id: bountyId, revision: 4, note: '' })).toMatchObject({ ok: false })
    expect(await announceAwards({ id: bountyId, revision: 5, note: '' })).toEqual({ ok: true, data: { id: bountyId } })
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith({ data: [{ bountyId, submissionId: id, reward: 'Mentorship' }] })
    mocks.bounty.mockResolvedValue({ ...bounty, resultsAnnouncedAt: new Date() })
    expect(await announceAwards({ id: bountyId, revision: 5, note: '' })).toMatchObject({ ok: false })
    expect(mocks.award).toHaveBeenCalledTimes(1)
  })
})
