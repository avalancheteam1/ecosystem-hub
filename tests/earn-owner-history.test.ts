import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ entry: vi.fn(), reviews: vi.fn(), finalStage: vi.fn(), raw: vi.fn() }))
const session = vi.hoisted(() => ({ getAuthState: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/security-events', () => ({ securityEvent: vi.fn() }))
vi.mock('@/lib/session', () => ({ getAuthState: session.getAuthState }))
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: db.raw,
    earnSubmission: { findUnique: db.entry },
    earnReview: { findMany: db.reviews },
    earnStage: { findFirst: db.finalStage },
  },
}))

import { EARN_PAGE_SIZE } from '@/app/(site)/earn/_lib/rules'
import * as workflowQueries from '@/app/(site)/earn/_lib/workflow-queries'

const { getOwnReceipt, getSubmissionForReview } = workflowQueries

const bountyId = '83a2f90c-8226-400c-8df0-19fe4827db49'
const id = '17f149fa-6932-4c27-85f5-096379ba4db6'
const stageId = '4f1a1aff-0e83-47df-b238-58c04948beac'
const ownerId = 'synthetic-history-owner'
const reviewerId = 'synthetic-reviewer'
// The same-revision approvals share a timestamp and need distinct decision identities.
const decisionTime = new Date('2026-11-23T12:00:00Z')
const denied = 'NEXT_HTTP_ERROR_FALLBACK;404'
type History = 'prior revision' | 'winning revision' | 'winning decision only'
type State = 'unannounced' | 'awarded' | 'nonwinner'
type Selection = 'current' | 'wrong' | 'missing' | 'foreign' | 'legacy null' | 'old revision' | 'nonapproval'
type Decision = 'approved' | 'needs_review'
type Review = {
  id: string
  submissionId: string
  revision: number
  decision: Decision
  feedback: string | null
  internalNote: string | null
  createdAt: Date
}
type ReviewWhere = {
  id?: string
  submissionId?: string
  revision?: { in: number[] }
  decision?: Decision | { not: Decision }
  feedback?: { not: null }
  OR?: ReviewWhere[]
}

function matchesReview(row: Review, where: ReviewWhere): boolean {
  const { id, submissionId, revision, decision, feedback, OR, ...other } = where
  if (Object.keys(other).length) throw new Error('Extend the synthetic history fixture for the paired selector')
  return (id === undefined || row.id === id) &&
    (submissionId === undefined || row.submissionId === submissionId) &&
    (revision === undefined || revision.in.includes(row.revision)) &&
    (decision === undefined || (typeof decision === 'string' ? row.decision === decision : row.decision !== decision.not)) &&
    (feedback === undefined || row.feedback !== null) &&
    (OR === undefined || OR.some((filter) => matchesReview(row, filter)))
}

function selectedFields(row: Record<string, unknown>, select: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]]))
}

function signedIn(actor: string, ...permissions: string[]) {
  session.getAuthState.mockResolvedValue({
    status: 'signed-in',
    user: { id: actor, isSuperAdmin: false, permissions: new Set(permissions) },
  })
}

function historyFixture(history: History, state: State, selection: Selection = 'current') {
  const revision = history === 'prior revision' ? 2 : 1
  const ordinary = {
    id: 'synthetic-01-public', submissionId: id, revision: 1, decision: 'needs_review' as const,
    feedback: `Synthetic ordinary feedback: ${history}`, internalNote: null, createdAt: new Date('2026-11-23T11:00:00Z'),
  }
  const cleared = {
    id: 'synthetic-02-cleared', submissionId: id, revision: 1, decision: 'approved' as const,
    feedback: `Synthetic cleared approval: ${history}`, internalNote: null, createdAt: decisionTime,
  }
  const revocation = {
    id: 'synthetic-03-revocation', submissionId: id, revision: 1, decision: 'needs_review' as const,
    feedback: null, internalNote: `Synthetic staff-only revocation: ${history}`, createdAt: decisionTime,
  }
  const winning = {
    id: 'synthetic-04-winning', submissionId: id, revision, decision: 'approved' as const,
    feedback: `Synthetic winning approval: ${history}`, internalNote: null, createdAt: decisionTime,
  }
  const unrelated = {
    ...winning, id: 'synthetic-foreign-selection', submissionId: '71811cec-5796-4dc5-ba80-abf6e4e4992d',
    feedback: 'Synthetic approval from another entry',
  }
  const decisions = history === 'winning decision only'
    ? [ordinary, winning]
    : [ordinary, cleared, revocation, ...(state === 'nonwinner' ? [] : [winning])]
  const reviewRows = [...decisions, unrelated]
  const revisions = Array.from({ length: revision }, (_, index) => ({
    number: revision - index, notes: `Synthetic evidence for revision ${revision - index}`,
  }))
  const selectedReviewIds = {
    current: winning.id, wrong: winning.id, missing: 'synthetic-missing-selection', foreign: unrelated.id,
    'legacy null': null, 'old revision': cleared.id, nonapproval: ordinary.id,
  }
  const row = {
    id, contributorId: ownerId, contributor: { name: 'Synthetic Owner' },
    status: state === 'nonwinner' ? 'needs_review' : 'approved',
    revision, version: 5, ownerVersion: 4, createdAt: decisionTime, previousSubmissionId: null,
    selectedReviewId: state === 'nonwinner' ? null : selectedReviewIds[selection],
    award: state === 'awarded' ? { reward: 'Synthetic recognition', rewardedAt: null } : null,
    stage: {
      id: stageId, bountyId, position: 2, title: 'Synthetic final', submissionPolicy: 'multiple',
      requiresPullRequest: false, deliverables: 'Synthetic final deliverables', approvalLimit: 2,
      bounty: {
        title: 'Synthetic bounty',
        deadline: state === 'unannounced' ? new Date(Date.now() + 60_000) : new Date('2026-11-23T12:30:00Z'),
        terms: 'Synthetic existing additional terms', termsVersion: 3, githubIssueUrl: null, cancelledAt: null,
        resultsAnnouncedAt: state === 'unannounced' ? null : new Date('2026-11-23T13:00:00Z'),
        _count: { stages: 2 },
      },
    },
    revisions,
  }
  db.entry.mockImplementation(async ({ where, select }) =>
    where.id === id && (where.contributorId === undefined || where.contributorId === ownerId) &&
      (where.stage?.bountyId === undefined || where.stage.bountyId === bountyId)
      ? selectedFields(row, select) : null,
  )
  db.reviews.mockImplementation(async ({ where, select }: { where: ReviewWhere; select: Record<string, unknown> }) =>
    reviewRows.filter((review) => matchesReview(review, where)).map((review) => selectedFields(review, select)),
  )
  // A second snapshot can have a different selection even on the same revision.
  const currentSelection = selection === 'wrong' ? cleared.id : row.selectedReviewId
  const award = row.award && { submissionId: row.id, bountyId }
  db.raw.mockImplementation(async (strings: TemplateStringsArray, ...bindings: unknown[]) => {
    expect(bindings).toEqual([row.id, row.contributorId, row.revision, row.stage.bountyId, row.selectedReviewId])
    const sql = String.raw(strings, ...bindings.map((_, index) => `$${index + 1}`)).replace(/\s+/g, ' ')
    expect(sql).toContain('JOIN "earn_stages" AS stage ON stage.id = submission."stageId"')
    expect(sql).toContain('JOIN "earn_bounties" AS bounty ON bounty.id = stage."bountyId"')
    expect(sql).toContain('JOIN "earn_awards" AS award ON award."submissionId" = submission.id AND award."bountyId" = bounty.id')
    expect(sql).toContain('JOIN "earn_reviews" AS review ON review.id = submission."selectedReviewId" AND review."submissionId" = submission.id AND review.revision = submission.revision')
    expect(sql).toContain('JOIN "earn_submission_revisions" AS revision ON revision."submissionId" = submission.id AND revision.number = submission.revision')
    expect(sql).toContain('WHERE submission.id = $1::uuid AND submission."contributorId" = $2 AND submission.status = \'approved\' AND submission.revision = $3')
    expect(sql).toContain('AND bounty.id = $4::uuid AND bounty."resultsAnnouncedAt" IS NOT NULL AND bounty."publishedAt" IS NOT NULL AND bounty."cancelledAt" IS NULL')
    expect(sql).toContain("AND review.id = $5 AND review.decision = 'approved' AND review.feedback IS NOT NULL")
    expect(sql).toContain('AND NOT EXISTS ( SELECT 1 FROM "earn_stages" AS later WHERE later."bountyId" = bounty.id AND later.position > stage.position )')

    const [submissionId, contributorId, currentRevision, requestedBountyId, reviewId] = bindings
    if (submissionId !== row.id || contributorId !== row.contributorId || currentRevision !== row.revision ||
        row.status !== 'approved' || requestedBountyId !== row.stage.bountyId || !row.stage.bounty.resultsAnnouncedAt ||
        row.stage.bounty.cancelledAt || row.stage.position !== row.stage.bounty._count.stages ||
        !award || award.submissionId !== submissionId || award.bountyId !== requestedBountyId ||
        !reviewId || reviewId !== currentSelection || !revisions.some(({ number }) => number === currentRevision)) return []
    const approved = reviewRows.find((review) => review.id === reviewId && review.submissionId === submissionId &&
      review.revision === currentRevision && review.decision === 'approved' && review.feedback !== null)
    if (!approved) return []
    const { id, revision, decision, feedback, createdAt } = approved
    return [{ id, revision, decision, feedback, createdAt }]
  })
  const shortlist = [
    { id: '13c9d7eb-fe8f-4df2-b3aa-351c42404fd1', revision: 2, version: 6, contributorId: reviewerId, contributor: { name: 'Synthetic Reviewer' } },
    { id, revision, version: row.version, contributorId: row.contributorId, contributor: row.contributor },
  ]
  db.finalStage.mockResolvedValue({ submissions: shortlist })
  return { ordinary, cleared, winning, unrelated, decisions, revisions, shortlist }
}

const clearedHistories = ['prior revision', 'winning revision'] as const

describe('Earn final-stage owner history', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    signedIn(ownerId)
  })

  it.each(clearedHistories)('shows only the awarded approval and withholds the cleared approval on the %s', async (history) => {
    const { ordinary, cleared, winning, revisions } = historyFixture(history, 'awarded')
    const receipt = await getOwnReceipt(bountyId, id, 1)

    expect(receipt).toMatchObject({ status: 'approved', version: 4, revisions, award: { reward: 'Synthetic recognition' } })
    expect(receipt?.reviews.map(({ feedback }) => feedback)).toEqual(expect.arrayContaining([ordinary.feedback, winning.feedback]))
    expect(JSON.stringify(receipt).includes(cleared.feedback), cleared.feedback).toBe(false)
    expect(db.raw).toHaveBeenCalledOnce()
  })

  it('keeps ordinary feedback and the exact awarded approval visible', async () => {
    const { ordinary, winning } = historyFixture('winning decision only', 'awarded')
    const receipt = await getOwnReceipt(bountyId, id, 1)

    expect(receipt?.reviews.map(({ id, feedback }) => ({ id, feedback }))).toEqual([
      { id: ordinary.id, feedback: ordinary.feedback }, { id: winning.id, feedback: winning.feedback },
    ])
    expect(receipt).not.toHaveProperty('selectedReviewId')
    expect(db.raw).toHaveBeenCalledOnce()
  })

  it.each(clearedHistories)('masks every private approval before announcement with a cleared %s', async (history) => {
    const { ordinary, cleared, winning, revisions } = historyFixture(history, 'unannounced')
    const receipt = await getOwnReceipt(bountyId, id, 1)

    expect(receipt).toMatchObject({ status: 'needs_review', version: 4, canRevise: true, canWithdraw: true, revisions, award: null })
    expect(receipt?.reviews.map(({ feedback }) => feedback)).toEqual([ordinary.feedback])
    expect(JSON.stringify(receipt)).not.toContain(cleared.feedback)
    expect(JSON.stringify(receipt)).not.toContain(winning.feedback)
    expect(db.raw).not.toHaveBeenCalled()
  })

  it('masks approval history for an announced nonwinner without an award', async () => {
    const { ordinary, cleared } = historyFixture('winning revision', 'nonwinner')
    const receipt = await getOwnReceipt(bountyId, id, 1)

    expect(receipt).toMatchObject({ status: 'needs_review', version: 4, award: null })
    expect(receipt?.reviews.map(({ feedback }) => feedback)).toEqual([ordinary.feedback])
    expect(JSON.stringify(receipt)).not.toContain(cleared.feedback)
    expect(db.raw).not.toHaveBeenCalled()
  })

  it.each(['wrong', 'missing', 'foreign', 'legacy null', 'old revision', 'nonapproval'] as const)('withholds approvals on an announced award (%s selection)', async (selection) => {
    const history = selection === 'old revision' ? 'prior revision' : 'winning revision'
    const { ordinary, cleared, winning, unrelated } = historyFixture(history, 'awarded', selection)
    const receipt = await getOwnReceipt(bountyId, id, 1)

    expect(receipt?.award).toMatchObject({ reward: 'Synthetic recognition' })
    expect(receipt?.reviews.map(({ feedback }) => feedback)).toContain(ordinary.feedback)
    const returned = JSON.stringify(receipt)
    expect.soft(returned.includes(cleared.feedback), cleared.feedback).toBe(false)
    expect.soft(returned.includes(winning.feedback), winning.feedback).toBe(false)
    expect(returned).not.toContain(unrelated.feedback)
    expect(receipt?.reviews).toHaveLength(1)
    if (selection === 'legacy null') expect(db.raw).not.toHaveBeenCalled()
    else expect(db.raw).toHaveBeenCalledOnce()
  })

  it('scopes owner history to its contributor and denies an ordinary owner staff history', async () => {
    historyFixture('prior revision', 'unannounced')
    await expect(getSubmissionForReview(id, 1)).rejects.toThrow(denied)
    expect(db.entry).not.toHaveBeenCalled()

    signedIn('synthetic-unrelated-owner')
    expect(await getOwnReceipt(bountyId, id, 1)).toBeNull()
    expect(db.entry).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id, contributorId: 'synthetic-unrelated-owner', stage: expect.objectContaining({ bountyId }) }),
    }))
    expect(db.reviews).not.toHaveBeenCalled()
    expect(db.raw).not.toHaveBeenCalled()
  })

  it.each([false, true])('retains all review decisions for staff with finalize grant %s', async (finalize) => {
    const { decisions, shortlist } = historyFixture('winning revision', 'unannounced')
    signedIn(reviewerId, 'earn.review', ...(finalize ? ['earn.finalize'] : []))
    const staff = await getSubmissionForReview(id, 1)

    expect(staff?.row).toMatchObject({ status: 'approved', version: 5 })
    expect(staff?.reviews).toEqual(decisions.map(({ id, decision, feedback, revision, internalNote }) => ({
      id, decision, feedback, revision, internalNote,
    })))
    const listPrivateSelections: unknown = Reflect.get(workflowQueries, 'listPrivateSelections')
    if (typeof listPrivateSelections !== 'function') throw new Error('The pinned staff shortlist query is unavailable')
    if (finalize) {
      const [own, other] = shortlist
      expect(await listPrivateSelections(bountyId, 1)).toEqual({
        rows: [
          { id: own.id, revision: own.revision, version: own.version, contributor: own.contributor, canRemove: false },
          { id: other.id, revision: other.revision, version: other.version, contributor: other.contributor, canRemove: true },
        ],
        hasMore: false,
      })
      expect(db.finalStage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        orderBy: { position: 'desc' },
        select: { submissions: {
          where: { status: 'approved' },
          select: { id: true, revision: true, version: true, contributorId: true, contributor: { select: { name: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: 0, take: EARN_PAGE_SIZE + 1,
        } },
      }))
    } else {
      await expect(listPrivateSelections(bountyId, 1)).rejects.toThrow(denied)
      expect(db.finalStage).not.toHaveBeenCalled()
    }
  })
})
