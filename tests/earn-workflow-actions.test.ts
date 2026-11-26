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
vi.mock('@/lib/mailer', () => ({ sendMail: vi.fn() }))

import { announceAwards, cancelEarnBounty, recordEarnReward, reviewStage, reviseStage, submitStage, withdrawStage } from '@/app/(site)/earn/_lib/workflow-actions'
import { ActionError } from '@/lib/action-error'
import { rateLimit } from '@/lib/rate-limit'

const bountyId = '83a2f90c-8226-400c-8df0-19fe4827db49'
const id = '17f149fa-6932-4c27-85f5-096379ba4db6'
const stageId = '4f1a1aff-0e83-47df-b238-58c04948beac'
const reviewer = { id: 'staff', isSuperAdmin: false, permissions: new Set(['earn.review']) }
const contributor = { id: 'contributor', isSuperAdmin: false, permissions: new Set() }
const entry = {
  status: 'pending', revision: 2, version: 4, ownerVersion: 4, stageId, contributorId: 'contributor',
  updatedAt: new Date('2026-11-23T12:00:00Z'),
}
const review = { id, bountyId, version: 4, decision: 'approved' as const, feedback: 'Visible later', internalNote: 'Staff only' }
const bounty = {
  deadline: new Date(0), terms: 'Current terms', termsVersion: 3, reward: 'Mentorship', resultsAnnouncedAt: null, revision: 5,
  updatedAt: new Date('2026-11-22T12:00:00Z'),
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
    expect(mocks.complete).toHaveBeenCalledWith({
      where: { id: bountyId }, data: expect.objectContaining({ revision: { increment: 1 } }),
    })
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
    const revisableEntry = { ...entry, id, status: 'changes_requested', previousSubmissionId: null }
    const intermediate = { ...stagedBounty, stages: [
      { ...stagedBounty.stages[1], position: 1, requiresPrevApproval: false },
      { ...stagedBounty.stages[2], position: 2 },
    ] }
    const evidence = { notes: 'Synthetic outline', links: [], pullRequests: [], termsVersion: bounty.termsVersion, accepted: true as const }
    const submit = { id, bountyId, stageId, evidence }
    const ref = { id, bountyId, version: revisableEntry.version }
    const revision = { ...ref, evidence, changeNote: 'Updated the outline' }
    const withdrawal = { ...ref, reason: 'Withdraw the outline' }

    beforeEach(() => {
      mocks.user = contributor
      mocks.bounty.mockResolvedValue({ ...intermediate, deadline: new Date(Date.now() + 60_000) })
      mocks.submissions.mockResolvedValue([])
      mocks.entry.mockResolvedValue(revisableEntry)
      mocks.findApproved.mockResolvedValue(null)
      mocks.createSubmission.mockResolvedValue({ count: 1 })
    })

    it('accepts a submission with an open window and unlocked stage', async () => {
      expect(await submitStage(submit)).toEqual({ ok: true, data: { id } })
      expect(mocks.createSubmission).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ id, stageId, contributorId: contributor.id }), skipDuplicates: true,
      })
      expect(mocks.createRevision).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ submissionId: id, number: 1, termsVersion: evidence.termsVersion }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it.each([
      { gate: 'after the deadline', offset: -60_000, entries: [priorApproval], error: 'Submissions are closed.' },
      { gate: 'before the stage unlocks', offset: 60_000, entries: [], error: expect.stringMatching(/Unlocks after approval|(?:choose|select|required).*previous|previous.*approved/i) },
    ])('#33 denies submission $gate without writing', async ({ offset, entries, error }) => {
      mocks.bounty.mockResolvedValueOnce({ ...stagedBounty, deadline: new Date(Date.now() + offset) })
      mocks.submissions.mockResolvedValueOnce(entries)

      expect(await submitStage(submit)).toEqual({ ok: false, error })
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('#3 accepts another submission after the contributor has an approved sibling', async () => {
      mocks.submissions.mockResolvedValueOnce([approvedSibling])

      expect(await submitStage(submit)).toEqual({ ok: true, data: { id } })
      expect(mocks.createSubmission).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ id, stageId, contributorId: contributor.id }), skipDuplicates: true,
      })
    })

    it('US-05 revises an owned historical entry with changes requested and null lineage', async () => {
      mocks.bounty.mockResolvedValueOnce({ ...stagedBounty, deadline: new Date(Date.now() + 60_000) })
      expect(await reviseStage(revision)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
        where: { id }, data: expect.objectContaining({ status: 'pending', revision: 3, version: { increment: 1 } }),
      })
      expect(mocks.update.mock.calls[0][0].data.previousSubmissionId ?? null).toBeNull()
      expect(mocks.createRevision).toHaveBeenCalledExactlyOnceWith({
        data: expect.objectContaining({ submissionId: id, number: 3, changeNote: revision.changeNote }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it('#3 revises an eligible entry after the contributor has an approved sibling', async () => {
      mocks.findApproved.mockResolvedValueOnce({ id: approvedSibling.id })

      expect(await reviseStage(revision)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
        where: { id }, data: expect.objectContaining({ status: 'pending', revision: 3, version: { increment: 1 } }),
      })
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
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
        where: { id }, data: expect.objectContaining({ status: 'withdrawn', version: { increment: 1 } }),
      })
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
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      where: { id }, data: expect.objectContaining({ status: 'approved', version: { increment: 1 } }),
    })
    expect(mocks.review).toHaveBeenCalledOnce()
    expect(mocks.audit).toHaveBeenCalledOnce()
  })

  describe('released contributor and finalizer contracts', () => {
    const finalStage = { ...bounty.stages[0], submissionPolicy: 'multiple', approvalLimit: 3 }
    const closedFinal = { ...bounty, stages: [finalStage] }
    const openFinal = () => ({ ...closedFinal, deadline: new Date(Date.now() + 60_000) })
    const finalizer = { ...reviewer, permissions: new Set(['earn.review', 'earn.finalize']) }
    const superAdmin = { ...reviewer, isSuperAdmin: true }
    const evidence = { notes: 'Synthetic work', links: [], pullRequests: [], termsVersion: bounty.termsVersion, accepted: true as const }
    const submit = { id, bountyId, stageId, evidence }
    const siblingId = '169afc2b-3647-4743-a4a2-a62fedaf6309'
    const otherId = 'c1ab4105-4db2-44dc-8891-e45cf5a152fc'
    const nextId = '71811cec-5796-4dc5-ba80-abf6e4e4992d'
    const eligibleParent = {
      id: siblingId, stageId: ideaStageId, contributorId: contributor.id, status: 'approved', stage: { bountyId, position: 1 },
    }
    const openSecondStage = () => ({
      ...openFinal(),
      stages: [stagedBounty.stages[0], { ...finalStage, position: 2, requiresPrevApproval: false }],
    })

    beforeEach(() => {
      mocks.user = contributor
      mocks.bounty.mockResolvedValue(openFinal())
      mocks.submissions.mockResolvedValue([])
      mocks.createSubmission.mockResolvedValue({ count: 1 })
    })

    it('US-05 requires a parent even when the old later-stage parallel switch was off', async () => {
      mocks.bounty.mockResolvedValue(openSecondStage())
      mocks.submissions.mockResolvedValue([eligibleParent])

      const result = await submitStage(submit)
      expect(mocks.lock).toHaveBeenCalledOnce()
      expect.soft(result).toMatchObject({
        ok: false,
        error: expect.stringMatching(/approved.*(?:previous|prior|preced|parent)|(?:previous|prior|preced|parent).*approved/i),
      })
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-05 accepts a supplied approved immediate parent on a formerly parallel later stage', async () => {
      mocks.bounty.mockResolvedValue(openSecondStage())
      const findParent = vi.fn(async ({ where }) => {
        if (!mocks.lock.mock.calls.length) throw new Error('Read the predecessor after locking its bounty.')
        return where.id === siblingId ? eligibleParent : null
      })
      mocks.entry.mockImplementation(findParent)
      mocks.findApproved.mockImplementation(findParent)
      mocks.count.mockResolvedValue(0)
      const continuation = { ...submit, previousSubmissionId: siblingId }

      const result = await submitStage(continuation)
      expect(mocks.lock, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toEqual({ ok: true, data: { id } })
      expect(findParent).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: siblingId }),
      }))
      expect(mocks.createSubmission).toHaveBeenCalledWith({
        data: expect.objectContaining({ id, stageId, contributorId: contributor.id, previousSubmissionId: siblingId }),
        skipDuplicates: true,
      })
    })

    it.each([
      { label: 'unknown parent', parent: null, child: null },
      { label: 'different owner', parent: { ...eligibleParent, contributorId: 'other-contributor' }, child: null },
      { label: 'different bounty', parent: { ...eligibleParent, stage: { bountyId: otherId, position: 1 } }, child: null },
      { label: 'wrong stage', parent: { ...eligibleParent, stageId: finalStageId, stage: { bountyId, position: 3 } }, child: null },
      { label: 'unapproved parent', parent: { ...eligibleParent, status: 'pending' }, child: null },
      { label: 'pending child', parent: eligibleParent, child: { id: nextId, status: 'pending' } },
      { label: 'approved child', parent: eligibleParent, child: { id: nextId, status: 'approved' } },
    ])('US-05 denies a continuation under lock ($label) without writes', async ({ parent, child }) => {
      mocks.bounty.mockResolvedValue({ ...openFinal(), stages: stagedBounty.stages })
      mocks.entry.mockImplementation(async ({ where }) => where.id === siblingId ? parent : null)
      mocks.findApproved.mockImplementation(async ({ where }) => where.id === siblingId ? parent : child)
      mocks.submissions.mockResolvedValue(parent ? [parent] : [])
      mocks.count.mockImplementation(async ({ where }) => where.previousSubmissionId === siblingId && child ? 1 : 0)
      const continuation = { ...submit, previousSubmissionId: siblingId }

      const result = await submitStage(continuation)
      expect(mocks.lock, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/previous|parent|preced|continue|continuation/i) })
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-06 allows early private selection while another eligible submission remains open', async () => {
      mocks.user = finalizer
      mocks.count.mockResolvedValue(0)

      expect(await reviewStage(review)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledWith({
        where: { id }, data: expect.objectContaining({ status: 'approved', updatedAt: entry.updatedAt }),
      })
      expect(mocks.update.mock.calls[0][0].data.ownerVersion ?? entry.ownerVersion).toBe(entry.ownerVersion)
      expect(mocks.award).not.toHaveBeenCalled()
      expect(mocks.complete).toHaveBeenCalledWith({
        where: { id: bountyId }, data: expect.objectContaining({ revision: { increment: 1 }, updatedAt: bounty.updatedAt }),
      })
      expect(mocks.complete.mock.calls[0][0].data.resultsAnnouncedAt).toBeUndefined()
      mocks.user = contributor
      expect(await submitStage({ ...submit, id: siblingId })).toEqual({ ok: true, data: { id: siblingId } })
    })

    it.each(['edit', 'withdraw'] as const)('US-06 accepts an owner form opened before private selection (%s)', async (operation) => {
      mocks.entry.mockResolvedValue({ ...entry, id, status: 'approved', ownerVersion: 4, version: 5 })
      const opened = { id, bountyId, version: 4 }
      const updated = operation === 'edit'
        ? await reviseStage({ ...opened, evidence, changeNote: 'Synthetic revision' })
        : await withdrawStage({ ...opened, reason: 'Synthetic withdrawal' })
      const status = operation === 'edit' ? 'pending' : 'withdrawn'

      expect(updated).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledWith({ where: { id }, data: expect.objectContaining({ status }) })
      expect(mocks.complete).toHaveBeenCalledWith({
        where: { id: bountyId }, data: expect.objectContaining({ revision: { increment: 1 }, updatedAt: bounty.updatedAt }),
      })
      expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ entityId: id }) })
      expect(mocks.award).not.toHaveBeenCalled()
    })

    it.each(['edit', 'withdraw'] as const)('US-06 rejects a genuinely stale owner form (%s)', async (operation) => {
      mocks.entry.mockResolvedValue({ ...entry, revision: entry.revision + 1, ownerVersion: 5, version: 6 })
      const stale = { id, bountyId, version: 4 }
      const result = operation === 'edit'
        ? await reviseStage({ ...stale, evidence, changeNote: 'Synthetic revision' })
        : await withdrawStage({ ...stale, reason: 'Synthetic withdrawal' })

      expect(result).toEqual({ ok: false, error: 'This submission changed. Reload and try again.' })
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.updateRevision).not.toHaveBeenCalled()
      expect(mocks.complete).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-06 gates a current early announcement and preserves a normal late announcement', async () => {
      const confirmation = { id: bountyId, revision: bounty.revision, note: '' }
      mocks.submissions.mockResolvedValue([{ id }])
      expect(await announceAwards(confirmation)).toEqual({ ok: false, error: 'Forbidden' })
      expect(mocks.tx).not.toHaveBeenCalled()

      mocks.user = superAdmin
      expect(await announceAwards(confirmation)).toMatchObject({ ok: false })
      mocks.bounty.mockResolvedValue(closedFinal)
      expect(await announceAwards({ ...confirmation, revision: bounty.revision - 1 })).toMatchObject({ ok: false })
      expect(mocks.award).not.toHaveBeenCalled()
      expect(mocks.complete).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()

      expect(await announceAwards(confirmation)).toEqual({ ok: true, data: { id: bountyId } })
      expect(mocks.award).toHaveBeenCalledOnce()
      expect(mocks.complete).toHaveBeenCalledWith({
        where: { id: bountyId }, data: expect.objectContaining({ resultsAnnouncedAt: expect.any(Date) }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    it.each([undefined, false])('US-06 denies early announcement without affirmative closeNow (%s)', async (closeNow) => {
      mocks.user = superAdmin
      mocks.submissions.mockResolvedValue([{ id }])
      const confirmation = { id: bountyId, revision: bounty.revision, note: '' }
      const input = closeNow === undefined ? confirmation : { ...confirmation, closeNow }
      const result = await announceAwards(input)
      expect(mocks.lock, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/confirm|close|deadline/i) })
      expect(mocks.submissions).not.toHaveBeenCalled()
      expect(mocks.award).not.toHaveBeenCalled()
      expect(mocks.complete).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-06 accepts a current explicit close-now confirmation before cutoff', async () => {
      mocks.user = superAdmin
      mocks.submissions.mockResolvedValue([{ id }])
      const input = { id: bountyId, revision: bounty.revision, note: '', closeNow: true }
      const result = await announceAwards(input)
      expect(mocks.lock, JSON.stringify(result)).toHaveBeenCalledOnce()
      expect(result).toEqual({ ok: true, data: { id: bountyId } })
      expect(mocks.award).toHaveBeenCalledOnce()
      expect(mocks.complete).toHaveBeenCalledExactlyOnceWith({
        where: { id: bountyId },
        data: expect.objectContaining({ resultsAnnouncedAt: expect.any(Date), revision: { increment: 1 } }),
      })
      expect(mocks.audit).toHaveBeenCalledOnce()
    })

    // Restore the RED assertion from 7abf292421df04037febaf717f1b54f6be3cd37f once Team1-approved default terms are available.
    it.todo('US-09 accepts current Team1-approved default terms when the bounty has no additional terms')

    it('US-09 denies submission without effective terms despite current acceptance', async () => {
      mocks.bounty.mockResolvedValue({ ...openFinal(), terms: null })

      expect(await submitStage(submit)).toEqual({ ok: false, error: 'Reload and accept the current bounty terms before submitting.' })
      expect(mocks.lock).toHaveBeenCalledOnce()
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-09 rejects unchecked acceptance and stale terms without writing', async () => {
      const unchecked = { ...submit, evidence: { ...evidence, accepted: false } }
      const stale = { ...submit, evidence: { ...evidence, termsVersion: bounty.termsVersion - 1 } }
      expect(await submitStage(unchecked as typeof submit)).toEqual({ ok: false, error: 'Accept the bounty terms.' })
      expect(mocks.tx).not.toHaveBeenCalled()
      expect(await submitStage(stale)).toEqual({ ok: false, error: 'Reload and accept the current bounty terms before submitting.' })
      expect(mocks.lock).toHaveBeenCalledOnce()
      expect(mocks.createSubmission).not.toHaveBeenCalled()
      expect(mocks.createRevision).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-26 blocks new selection on a legacy blank cap after the deadline', async () => {
      mocks.user = finalizer
      mocks.bounty.mockResolvedValue({ ...closedFinal, stages: [{ ...finalStage, approvalLimit: null }] })

      expect.soft(await reviewStage(review)).toMatchObject({ ok: false, error: expect.stringMatching(/cap|limit/i) })
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.review).not.toHaveBeenCalled()
      expect(mocks.award).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })

    it('US-26 allows otherwise identical late selection after an explicit cap is present', async () => {
      mocks.user = finalizer
      mocks.bounty.mockResolvedValue(closedFinal)
      mocks.count.mockResolvedValue(0)

      expect(await reviewStage(review)).toEqual({ ok: true, data: { id } })
      expect(mocks.update).toHaveBeenCalledWith({ where: { id }, data: expect.objectContaining({ status: 'approved' }) })
    })

    it('US-27 selects and awards two entries for one contributor within the overall cap', async () => {
      mocks.user = finalizer
      mocks.bounty.mockResolvedValue(closedFinal)
      const rows = [
        { ...entry, id },
        { ...entry, id: siblingId },
        { ...entry, id: nextId },
        { ...entry, id: otherId, status: 'approved', contributorId: 'other-contributor' },
      ]
      mocks.entry.mockImplementation(async ({ where }) => rows.find((row) => row.id === where.id))
      mocks.count.mockImplementation(async ({ where }) => rows.filter((row) =>
        Object.entries(where).every(([field, value]) => row[field as keyof typeof entry] === value),
      ).length)
      mocks.update.mockImplementation(async ({ where, data }) => {
        const row = rows.find((row) => row.id === where.id)!
        row.status = data.status
      })
      mocks.submissions.mockImplementation(async () => rows.filter((row) => row.status === 'approved'))

      for (const selectedId of [id, siblingId]) {
        expect(await reviewStage({ ...review, id: selectedId })).toEqual({ ok: true, data: { id: selectedId } })
      }
      expect(await reviewStage({ ...review, id: nextId })).toEqual({ ok: false, error: 'This stage has reached its approval limit.' })
      expect(rows.find((row) => row.id === nextId)?.status).toBe('pending')
      expect(mocks.review).toHaveBeenCalledTimes(2)
      expect(mocks.audit).toHaveBeenCalledTimes(2)
      expect(mocks.award).not.toHaveBeenCalled()

      mocks.user = superAdmin
      mocks.bounty.mockResolvedValue({ ...closedFinal, revision: bounty.revision + 2 })
      expect(await announceAwards({ id: bountyId, revision: bounty.revision + 2, note: '' })).toEqual({ ok: true, data: { id: bountyId } })
      expect(mocks.award).toHaveBeenCalledExactlyOnceWith({
        data: expect.arrayContaining([id, siblingId, otherId].map((submissionId) => ({ bountyId, submissionId, reward: bounty.reward }))),
      })
      expect(mocks.award.mock.calls[0][0].data).toHaveLength(3)
    })

    it('US-28 accepts distinct eligible entries from the same contributor within the existing limiter', async () => {
      // A first-and-final stage isolates the contribution policy from parent selection.
      const contributorId = 'synthetic-multiple-entry-contributor'
      mocks.user = { ...contributor, id: contributorId }
      for (const [index, submissionId] of [id, siblingId, nextId, otherId].entries()) {
        mocks.submissions.mockResolvedValue(Array.from({ length: index }, () => ({ stageId, status: 'pending' })))
        expect(await submitStage({ ...submit, id: submissionId })).toEqual({ ok: true, data: { id: submissionId } })
        expect(mocks.createSubmission).toHaveBeenLastCalledWith({
          data: expect.objectContaining({ id: submissionId, stageId, contributorId }), skipDuplicates: true,
        })
      }
      expect(mocks.createRevision).toHaveBeenCalledTimes(4)
      expect(mocks.audit).toHaveBeenCalledTimes(4)
    })

    it('US-28 preserves the shared write limiter across submit, revision and withdrawal', async () => {
      const contributorId = 'synthetic-rate-limited-contributor'
      mocks.user = { ...contributor, id: contributorId }
      for (let hit = 0; hit < 30; hit++) rateLimit(`earn-work:${contributorId}`, { limit: 30, windowMs: 60_000 })
      const ref = { id, bountyId, version: entry.version }
      const refused = { ok: false, error: 'Too many updates. Wait a minute and try again.' }
      expect(await submitStage(submit)).toEqual(refused)
      expect(await reviseStage({ ...ref, evidence, changeNote: 'Synthetic revision' })).toEqual(refused)
      expect(await withdrawStage({ ...ref, reason: 'Synthetic withdrawal' })).toEqual(refused)
      expect(mocks.tx).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
    })
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
    expect.soft(mocks.update).toHaveBeenCalledWith({
      where: { id }, data: expect.objectContaining({ status: 'needs_review', version: { increment: 1 }, updatedAt: entry.updatedAt }),
    })
    expect(mocks.update.mock.calls[0][0].data.ownerVersion ?? entry.ownerVersion).toBe(entry.ownerVersion)
    expect.soft(mocks.complete).toHaveBeenCalledWith({
      where: { id: bountyId }, data: expect.objectContaining({ revision: { increment: 1 }, updatedAt: bounty.updatedAt }),
    })
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
