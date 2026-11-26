import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as unknown, tx: vi.fn(), lock: vi.fn(), bounty: vi.fn(), entry: vi.fn(), count: vi.fn(),
  audit: vi.fn(), update: vi.fn(), review: vi.fn(), award: vi.fn(), complete: vi.fn(), submissions: vi.fn(),
  findApproved: vi.fn(), createSubmission: vi.fn(), createRevision: vi.fn(), updateRevision: vi.fn(), updateReward: vi.fn(),
  requireFlag: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/monitoring', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/db', () => ({ prisma: { $transaction: mocks.tx } }))
vi.mock('@/lib/flag-store', () => ({ requireFlag: mocks.requireFlag }))

import { announceAwards, cancelEarnBounty, recordEarnReward, reviewStage, reviseStage, submitStage, withdrawStage } from '@/app/(site)/earn/_lib/workflow-actions'
import { ActionError } from '@/lib/action-error'

const bountyId = '83a2f90c-8226-400c-8df0-19fe4827db49'
const id = '17f149fa-6932-4c27-85f5-096379ba4db6'
const stageId = '4f1a1aff-0e83-47df-b238-58c04948beac'
const reviewer = { id: 'staff', isSuperAdmin: false, permissions: new Set(['earn.review']) }
const contributor = { id: 'contributor', isSuperAdmin: false, permissions: new Set() }
const entry = { status: 'pending', revision: 2, version: 4, stageId, contributorId: 'contributor' }
const review = { id, bountyId, version: 4, decision: 'approved' as const, feedback: 'Visible later', internalNote: 'Staff only' }
const bounty = {
  deadline: new Date(0), terms: 'Current terms', termsVersion: 3, reward: 'Mentorship', resultsAnnouncedAt: null, revision: 5,
  stages: [{ id: stageId, position: 1, title: 'Final work', approvalLimit: 1, submissionPolicy: 'resubmit', requiresPullRequest: false }],
}
const ideaStageId = 'fe8520ca-cfa9-4adc-bf3f-fe4f6918b2cb'
const finalStageId = '90d57794-d470-4a59-9536-20bcb3a269e7'
const stagedBounty = {
  ...bounty,
  githubIssueUrl: null,
  stages: [
    { ...bounty.stages[0], id: ideaStageId, title: 'Idea', requiresPrevApproval: false },
    { ...bounty.stages[0], position: 2, title: 'Outline', approvalLimit: 2, submissionPolicy: 'multiple', requiresPrevApproval: true },
    { ...bounty.stages[0], id: finalStageId, position: 3, requiresPrevApproval: true },
  ],
}

describe('Earn action boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.user = reviewer
    mocks.requireFlag.mockResolvedValue(undefined)
    mocks.tx.mockImplementation(async (execute) => execute({
      $queryRaw: mocks.lock, earnBounty: { findUnique: mocks.bounty, update: mocks.complete },
      earnSubmission: {
        findUnique: mocks.entry, count: mocks.count, update: mocks.update, findMany: mocks.submissions,
        findFirst: mocks.findApproved, createMany: mocks.createSubmission,
      },
      earnSubmissionRevision: { create: mocks.createRevision, update: mocks.updateRevision },
      earnReview: { create: mocks.review }, earnAward: { createMany: mocks.award, updateMany: mocks.updateReward },
      auditLog: { create: mocks.audit },
    }))
    mocks.bounty.mockResolvedValue(bounty)
    mocks.entry.mockResolvedValue(entry)
  })

  it('blocks contributor writes before any transaction when Earn is off', async () => {
    mocks.user = { id: 'contributor', isSuperAdmin: false, permissions: new Set() }
    mocks.requireFlag.mockRejectedValue(new ActionError('Earn is not available right now'))
    const evidence = { notes: 'Work', links: [], pullRequests: [], termsVersion: 3, accepted: true as const }
    const ref = { id, bountyId, version: 4 }
    const expected = { ok: false, error: 'Earn is not available right now' }
    expect(await submitStage({ id, bountyId, stageId, evidence })).toEqual(expected)
    expect(await reviseStage({ ...ref, evidence, changeNote: 'Updated' })).toEqual(expected)
    expect(await withdrawStage({ ...ref, reason: 'Withdraw' })).toEqual(expected)
    expect(mocks.requireFlag.mock.calls).toEqual([['earn'], ['earn'], ['earn']])
    expect(mocks.tx).not.toHaveBeenCalled()
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

  describe('contributor writes on an intermediate multiple-entry stage', () => {
    const priorApproval = { stageId: ideaStageId, status: 'approved' }
    const approvedSibling = { id: '169afc2b-3647-4743-a4a2-a62fedaf6309', stageId, contributorId: contributor.id, status: 'approved' }
    const revisableEntry = { ...entry, id, status: 'changes_requested' }
    const evidence = { notes: 'Synthetic outline', links: [], pullRequests: [], termsVersion: bounty.termsVersion, accepted: true as const }
    const submit = { id, bountyId, stageId, evidence }
    const ref = { id, bountyId, version: revisableEntry.version }
    const revision = { ...ref, evidence, changeNote: 'Updated the outline' }
    const withdrawal = { ...ref, reason: 'Withdraw the outline' }

    beforeEach(() => {
      mocks.user = contributor
      mocks.bounty.mockResolvedValue({ ...stagedBounty, deadline: new Date(Date.now() + 60_000) })
      mocks.submissions.mockResolvedValue([priorApproval])
      mocks.entry.mockResolvedValue(revisableEntry)
      mocks.findApproved.mockResolvedValue(null)
      mocks.createSubmission.mockResolvedValue({ count: 1 })
    })

    it('accepts a submission with an open window and unlocked stage', async () => {
      expect(await submitStage(submit)).toEqual({ ok: true, data: { id } })
      expect(mocks.createSubmission).toHaveBeenCalledExactlyOnceWith({ data: { id, stageId, contributorId: contributor.id }, skipDuplicates: true })
      expect(mocks.createRevision).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ submissionId: id, number: 1, termsVersion: evidence.termsVersion }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it.each([
      { gate: 'after the deadline', offset: -60_000, entries: [priorApproval], error: 'Submissions are closed.' },
      { gate: 'before the stage unlocks', offset: 60_000, entries: [], error: 'Unlocks after approval of “Idea”.' },
    ])('#33 denies submission $gate without writing', async ({ offset, entries, error }) => {
      mocks.bounty.mockResolvedValueOnce({ ...stagedBounty, deadline: new Date(Date.now() + offset) })
      mocks.submissions.mockResolvedValueOnce(entries)

      expect(await submitStage(submit)).toEqual({ ok: false, error })
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('#3 accepts another submission after the contributor has an approved sibling', async () => {
      mocks.submissions.mockResolvedValueOnce([priorApproval, approvedSibling])

      expect(await submitStage(submit)).toEqual({ ok: true, data: { id } })
      expect(mocks.createSubmission).toHaveBeenCalledExactlyOnceWith({ data: { id, stageId, contributorId: contributor.id }, skipDuplicates: true })
    })

    it('revises an owned entry with changes requested', async () => {
      expect(await reviseStage(revision)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { status: 'pending', revision: 3, version: { increment: 1 } } })
      expect(mocks.createRevision).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ submissionId: id, number: 3, changeNote: revision.changeNote }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it('#3 revises an eligible entry after the contributor has an approved sibling', async () => {
      mocks.findApproved.mockResolvedValueOnce({ id: approvedSibling.id })

      expect(await reviseStage(revision)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { status: 'pending', revision: 3, version: { increment: 1 } } })
    })

    it('#33 denies withdrawal by another contributor and accepts it from the owner', async () => {
      const other = { ...contributor, id: 'other-contributor' }
      mocks.user = other
      mocks.entry.mockResolvedValueOnce(null)

      expect(await withdrawStage(withdrawal)).toEqual({ ok: false, error: 'This submission is unavailable.' })
      expect(mocks.entry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ where: { id, contributorId: other.id, stage: { bountyId } } }))
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.updateRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()

      mocks.user = contributor
      expect(await withdrawStage(withdrawal)).toEqual({ ok: true, data: { id } })
      expect(mocks.entry).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id, contributorId: contributor.id, stage: { bountyId } } }))
      expect(mocks.update).toHaveBeenCalledOnce()
      expect(mocks.updateRevision).toHaveBeenCalledOnce()
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it('#36 audits the prior submission status on a successful withdrawal', async () => {
      expect(await withdrawStage(withdrawal)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { status: 'withdrawn', version: { increment: 1 } } })
      expect(mocks.updateRevision).toHaveBeenCalledExactlyOnceWith({
        where: { submissionId_number: { submissionId: id, number: revisableEntry.revision } },
        data: { withdrawnAt: expect.any(Date), withdrawalReason: withdrawal.reason },
      })
      expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ actorId: contributor.id, action: 'earn.submission.withdraw', entityId: id, after: expect.objectContaining({ status: 'withdrawn' }) }),
      })
      expect(mocks.audit.mock.calls[0][0].data.before).toEqual(expect.objectContaining({ status: revisableEntry.status }))
    })
  })

  it('#3 enforces a configured intermediate-stage approval cap', async () => {
    mocks.bounty.mockResolvedValue(stagedBounty)
    mocks.findApproved.mockResolvedValue(null)
    mocks.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1)

    expect(await reviewStage(review)).toEqual({ ok: false, error: 'This stage has reached its approval limit.' })
    expect(mocks.count).toHaveBeenCalledExactlyOnceWith({ where: { stageId, status: 'approved' } })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.review).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()

    expect(await reviewStage(review)).toEqual({ ok: true, data: { id } })
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id }, data: { status: 'approved', version: { increment: 1 } } })
    expect(mocks.review).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledOnce()
  })

  it('#33 denies recording an existing reward before announcement and accepts it after', async () => {
    mocks.user = { id: 'publisher', isSuperAdmin: false, permissions: new Set(['earn.publish']) }
    const award = { id: '635a35e1-e8bc-4175-877a-16333d81d46f', bountyId, rewardedAt: null as Date | null, rewardNote: null as string | null }
    const input = { bountyId, id: award.id, note: 'Mentorship completed' }
    let resultsAnnouncedAt: Date | null = null
    mocks.updateReward.mockImplementation(async ({ where, data }) => {
      if (where.id !== award.id || where.bountyId !== award.bountyId || where.rewardedAt !== award.rewardedAt) return { count: 0 }
      if (where.bounty?.resultsAnnouncedAt?.not === null && resultsAnnouncedAt === null) return { count: 0 }
      award.rewardedAt = data.rewardedAt
      award.rewardNote = data.rewardNote
      return { count: 1 }
    })

    expect(await recordEarnReward(input)).toEqual({ ok: false, error: 'This reward was already recorded or is unavailable.' })
    expect(mocks.updateReward).toHaveBeenCalledExactlyOnceWith({
      where: { id: award.id, bountyId, rewardedAt: null, bounty: { resultsAnnouncedAt: { not: null } } },
      data: { rewardedAt: expect.any(Date), rewardNote: input.note },
    })
    expect(award).toMatchObject({ rewardedAt: null, rewardNote: null })
    expect(mocks.audit).not.toHaveBeenCalled()

    resultsAnnouncedAt = new Date()
    expect(await recordEarnReward(input)).toEqual({ ok: true, data: { id: award.id } })
    expect(award).toMatchObject({ rewardedAt: expect.any(Date), rewardNote: input.note })
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ action: 'earn.reward.record', entityId: award.id }),
    })
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
    mocks.submissions.mockResolvedValueOnce([{ id }])
    expect(await announceAwards({ id: bountyId, revision: 4, note: '' })).toMatchObject({ ok: false })
    expect(await announceAwards({ id: bountyId, revision: 5, note: '' })).toEqual({ ok: true, data: { id: bountyId } })
    expect(mocks.award).toHaveBeenCalledExactlyOnceWith({ data: [{ bountyId, submissionId: id, reward: 'Mentorship' }] })
    mocks.bounty.mockResolvedValue({ ...bounty, resultsAnnouncedAt: new Date() })
    expect(await announceAwards({ id: bountyId, revision: 5, note: '' })).toMatchObject({ ok: false })
    expect(mocks.award).toHaveBeenCalledTimes(1)
  })
})
