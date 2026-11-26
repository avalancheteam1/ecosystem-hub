import 'server-only'
import type { EarnSubmissionStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requirePermission, requireUser } from '@/lib/guards'
import { EARN_PAGE_SIZE } from './rules'
import { bountyIdSchema } from './schemas'
import { activeContinuationStatuses, ownerSubmissionStatus, revisionAllowed } from './stage-rules'

// Cancelled listings leave the public catalog but their owned receipts and staff history remain readable.
const historicalStage = { bounty: { OR: [{ publishedAt: { not: null } }, { cancelledAt: { not: null } }] } } satisfies Prisma.EarnStageWhereInput
const evidenceFields = {
  number: true, notes: true, links: true, pullRequests: true, changeNote: true,
  termsVersion: true, acceptedAt: true, withdrawnAt: true, withdrawalReason: true,
} satisfies Prisma.EarnSubmissionRevisionSelect
const lineageFields = {
  id: true, revision: true, createdAt: true, stage: { select: { id: true, title: true, position: true } },
} satisfies Prisma.EarnSubmissionSelect
type LineageNode = Prisma.EarnSubmissionGetPayload<{ select: typeof lineageFields }>
type LineageRow = Omit<LineageNode, 'stage'> & { stageId: string; stageTitle: string; stagePosition: number }

async function readLineage(bountyId: string, contributorId: string, current: LineageNode, previousId: string | null) {
  if (!previousId || current.stage.position <= 1) return [current]
  // Stage positions decrease at each hop, preventing cycles. The stage schema caps the chain at 20 entries including the root.
  const rows = await prisma.$queryRaw<LineageRow[]>`
    WITH RECURSIVE lineage AS (
      SELECT submission.id, submission.revision, submission."createdAt", submission."previousSubmissionId",
        submission."contributorId", stage."bountyId", stage.id AS "stageId", stage.title AS "stageTitle",
        stage.position AS "stagePosition", 1 AS depth
      FROM "earn_submissions" AS submission
      JOIN "earn_stages" AS stage ON stage.id = submission."stageId"
      JOIN "earn_bounties" AS bounty ON bounty.id = stage."bountyId"
      WHERE submission.id = ${current.id}::uuid AND submission."contributorId" = ${contributorId}::text
        AND bounty.id = ${bountyId}::uuid AND stage.position = ${current.stage.position}::integer
        AND (bounty."publishedAt" IS NOT NULL OR bounty."cancelledAt" IS NOT NULL)
      UNION ALL
      SELECT parent.id, parent.revision, parent."createdAt", parent."previousSubmissionId",
        parent."contributorId", stage."bountyId", stage.id, stage.title, stage.position, lineage.depth + 1
      FROM lineage
      JOIN "earn_submissions" AS parent ON parent.id = lineage."previousSubmissionId"
        AND parent."contributorId" = lineage."contributorId"
      JOIN "earn_stages" AS stage ON stage.id = parent."stageId" AND stage."bountyId" = lineage."bountyId"
        AND stage.position = lineage."stagePosition" - 1
      WHERE lineage.depth < 20 AND stage.position > 0
    )
    SELECT id, revision, "createdAt", "stageId", "stageTitle", "stagePosition"
    FROM lineage WHERE depth > 1 ORDER BY "stagePosition" ASC
  `
  return [...rows.map(({ id, revision, createdAt, stageId, stageTitle, stagePosition }) => ({
    id, revision, createdAt, stage: { id: stageId, title: stageTitle, position: stagePosition },
  })), current]
}

export async function getContributorProgress(bountyId: string, stageId: string, page: number) {
  const user = await requireUser()
  const where = { contributorId: user.id, stage: { ...historicalStage, bountyId } }
  const [attempts, rows, stage] = await Promise.all([
    prisma.earnSubmission.groupBy({ by: ['stageId', 'status'], where }),
    prisma.earnSubmission.findMany({
      where: { ...where, stageId },
      select: { id: true, status: true, revision: true, createdAt: true, award: { select: { id: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
    }),
    prisma.earnStage.findUnique({
      where: { id: stageId, bountyId, ...historicalStage },
      select: { bounty: { select: {
        deadline: true, cancelledAt: true, resultsAnnouncedAt: true,
        stages: { orderBy: { position: 'asc' }, select: { id: true } },
      } } },
    }),
  ])
  const bounty = stage?.bounty
  const index = bounty?.stages.findIndex((item) => item.id === stageId) ?? -1
  const prior = bounty?.stages[index - 1]
  const finalId = bounty?.stages.at(-1)?.id
  const awaitingAnnouncement = !bounty?.resultsAnnouncedAt
  const eligibleParents = prior && bounty && !bounty.cancelledAt && !bounty.resultsAnnouncedAt && bounty.deadline > new Date()
    ? await prisma.earnSubmission.findMany({
      where: {
        contributorId: user.id, status: 'approved', stageId: prior.id,
        continuations: { none: { contributorId: user.id, stageId, status: { in: [...activeContinuationStatuses] } } },
      },
      select: lineageFields,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    : []
  // Grouping by the raw status can split a previously single group after a private review.
  const ownerAttempts = new Map<string, (typeof attempts)[number]>()
  for (const attempt of attempts) {
    const status = ownerSubmissionStatus(attempt.status, awaitingAnnouncement && attempt.stageId === finalId)
    ownerAttempts.set(`${attempt.stageId}:${status}`, { ...attempt, status })
  }
  const visibleRows = rows.slice(0, EARN_PAGE_SIZE).map((row) => ({
    ...row,
    status: ownerSubmissionStatus(row.status, awaitingAnnouncement && stageId === finalId),
    award: awaitingAnnouncement ? null : row.award,
  }))
  return {
    attempts: [...ownerAttempts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, attempt]) => attempt),
    rows: visibleRows, hasMore: rows.length > EARN_PAGE_SIZE, eligibleParents,
  }
}

export async function getOwnReceipt(bountyId: string, id: string, page: number) {
  const user = await requireUser()
  if (!bountyIdSchema.safeParse(bountyId).success || !bountyIdSchema.safeParse(id).success) return null
  const row = await prisma.earnSubmission.findUnique({
    where: { id, contributorId: user.id, stage: { ...historicalStage, bountyId } },
    select: {
      id: true, status: true, revision: true, version: true, ownerVersion: true, createdAt: true, previousSubmissionId: true, selectedReviewId: true,
      stage: { select: {
        id: true, title: true, position: true, submissionPolicy: true, requiresPullRequest: true,
        bounty: { select: {
          title: true, deadline: true, terms: true, termsVersion: true, githubIssueUrl: true, resultsAnnouncedAt: true, cancelledAt: true,
          _count: { select: { stages: true } },
        } },
      } },
      revisions: { select: evidenceFields, orderBy: { number: 'desc' }, skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1 },
      award: { select: { reward: true, rewardedAt: true } },
    },
  })
  if (!row) return null
  const final = row.stage.position === row.stage.bounty._count.stages
  const pendingAnnouncement = final && !row.stage.bounty.resultsAnnouncedAt
  const { ownerVersion, previousSubmissionId, selectedReviewId, ...entry } = row
  const revisionNumbers = row.revisions.map((revision) => revision.number)
  // Only an independently confirmed intermediate stage can show ordinary approval feedback.
  const reviews = await prisma.earnReview.findMany({
    where: {
      submissionId: id,
      revision: { in: revisionNumbers },
      feedback: { not: null },
      ...(final || row.award ? { decision: { not: 'approved' as const } } : {
        OR: [
          { decision: { not: 'approved' } },
          { submission: { contributorId: user.id, stage: {
            id: row.stage.id, bountyId, position: row.stage.position,
            bounty: { stages: { some: { position: { gt: row.stage.position } } } },
          } } },
        ],
      }),
    },
    select: { id: true, revision: true, decision: true, feedback: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  if (final && !pendingAnnouncement && row.award && selectedReviewId && revisionNumbers.includes(row.revision)) {
    // Authorize the feedback and read it in the same PostgreSQL statement snapshot.
    // Announcement awards the current revision and closes all subsequent revision writes.
    const [approved] = await prisma.$queryRaw<typeof reviews>`
      SELECT review.id, review.revision, review.decision, review.feedback, review."createdAt"
      FROM "earn_submissions" AS submission
      JOIN "earn_stages" AS stage ON stage.id = submission."stageId"
      JOIN "earn_bounties" AS bounty ON bounty.id = stage."bountyId"
      JOIN "earn_awards" AS award ON award."submissionId" = submission.id AND award."bountyId" = bounty.id
      JOIN "earn_reviews" AS review ON review.id = submission."selectedReviewId"
        AND review."submissionId" = submission.id AND review.revision = submission.revision
      JOIN "earn_submission_revisions" AS revision ON revision."submissionId" = submission.id
        AND revision.number = submission.revision
      WHERE submission.id = ${id}::uuid
        AND submission."contributorId" = ${user.id}
        AND submission.status = 'approved' AND submission.revision = ${row.revision}
        AND bounty.id = ${bountyId}::uuid AND bounty."resultsAnnouncedAt" IS NOT NULL
        AND bounty."publishedAt" IS NOT NULL AND bounty."cancelledAt" IS NULL
        AND review.id = ${selectedReviewId} AND review.decision = 'approved' AND review.feedback IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "earn_stages" AS later
          WHERE later."bountyId" = bounty.id AND later.position > stage.position
        )
    `
    if (approved) {
      reviews.push(approved)
      reviews.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    }
  }
  const stageApproved = !final && row.stage.submissionPolicy !== 'multiple' && !!await prisma.earnSubmission.findFirst({
    where: { stageId: row.stage.id, contributorId: user.id, status: 'approved' },
    select: { id: true },
  })
  const lineage = await readLineage(bountyId, user.id, {
    id, revision: row.revision, createdAt: row.createdAt,
    stage: { id: row.stage.id, title: row.stage.title, position: row.stage.position },
  }, previousSubmissionId)
  const status = ownerSubmissionStatus(row.status, pendingAnnouncement)
  const bounty = row.stage.bounty
  const open = !bounty.cancelledAt && !bounty.resultsAnnouncedAt && bounty.deadline > new Date()
  let canRevise = page === 1 && open && !!bounty.terms && !stageApproved && revisionAllowed(row.stage.submissionPolicy, status)
  if (canRevise && previousSubmissionId && (status === 'rejected' || status === 'withdrawn')) {
    canRevise = lineage.length > 1 && !await prisma.earnSubmission.count({
      where: { previousSubmissionId, stageId: row.stage.id, contributorId: user.id, status: { in: [...activeContinuationStatuses] }, id: { not: id } },
    })
  }
  return {
    ...entry, status, version: ownerVersion ?? row.version, award: pendingAnnouncement ? null : row.award,
    final, stageApproved, reviews: reviews.map(({ createdAt: _createdAt, ...review }) => review),
    hasMore: row.revisions.length > EARN_PAGE_SIZE, revisions: row.revisions.slice(0, EARN_PAGE_SIZE),
    previousSubmissionId: lineage.at(-2)?.id ?? null, lineage, canRevise,
    canWithdraw: open && status !== 'approved' && status !== 'withdrawn',
  }
}

export async function getAwardSummary(bountyId: string) {
  return prisma.earnAward.count({ where: { bountyId, bounty: { publishedAt: { not: null }, resultsAnnouncedAt: { not: null } } } })
}

export async function listReviewQueue(page: number, status?: EarnSubmissionStatus, bountyId?: string) {
  await requirePermission('earn.review')
  const rows = await prisma.earnSubmission.findMany({
    where: {
      status: status ?? { in: ['pending', 'needs_review'] },
      stage: {
        bounty: { ...historicalStage.bounty, ...(status ? {} : { cancelledAt: null, resultsAnnouncedAt: null }) },
        ...(bountyId ? { bountyId } : {}),
      },
    },
    select: {
      id: true, status: true, revision: true, updatedAt: true,
      stage: { select: { title: true, bounty: { select: { title: true } } } },
      contributor: { select: { name: true } },
    },
    orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
  })
  return { rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}

export async function getSubmissionForReview(id: string, page: number) {
  const user = await requirePermission('earn.review')
  if (!bountyIdSchema.safeParse(id).success) return null
  const row = await prisma.earnSubmission.findUnique({
    where: { id, stage: historicalStage },
    select: {
      id: true, contributorId: true, status: true, revision: true, version: true, createdAt: true, previousSubmissionId: true, contributor: { select: { name: true } },
      stage: { select: { id: true, title: true, position: true, deliverables: true, approvalLimit: true, bountyId: true, bounty: { select: {
        title: true, deadline: true, resultsAnnouncedAt: true, cancelledAt: true, _count: { select: { stages: true } },
      } } } },
      revisions: { orderBy: { number: 'desc' }, select: evidenceFields, skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1 },
    },
  })
  if (!row) return null
  const reviews = await prisma.earnReview.findMany({
    where: { submissionId: id, revision: { in: row.revisions.map((revision) => revision.number) } },
    select: { id: true, revision: true, decision: true, feedback: true, internalNote: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const { previousSubmissionId, ...entry } = row
  const lineage = await readLineage(row.stage.bountyId, row.contributorId, {
    id, revision: row.revision, createdAt: row.createdAt,
    stage: { id: row.stage.id, title: row.stage.title, position: row.stage.position },
  }, previousSubmissionId)
  return { row: { ...entry, revisions: row.revisions.slice(0, EARN_PAGE_SIZE) }, user, reviews, lineage, hasMore: row.revisions.length > EARN_PAGE_SIZE }
}

export async function listPrivateSelections(bountyId: string, page: number) {
  const user = await requirePermission('earn.review')
  await requirePermission('earn.finalize')
  if (!bountyIdSchema.safeParse(bountyId).success) return { rows: [], hasMore: false }
  const final = await prisma.earnStage.findFirst({
    where: { bountyId, bounty: { publishedAt: { not: null }, cancelledAt: null, resultsAnnouncedAt: null } },
    orderBy: { position: 'desc' },
    select: { submissions: {
      where: { status: 'approved' },
      select: { id: true, revision: true, version: true, contributorId: true, contributor: { select: { name: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
    } },
  })
  const rows = final?.submissions ?? []
  return {
    rows: rows.slice(0, EARN_PAGE_SIZE).map(({ contributorId, ...row }) => ({ ...row, canRemove: contributorId !== user.id })),
    hasMore: rows.length > EARN_PAGE_SIZE,
  }
}

export async function getResultsForPublishing(bountyId: string, page: number) {
  await requirePermission('earn.publish')
  const [submitted, rows, final] = await Promise.all([
    prisma.earnSubmission.count({ where: { stage: { bountyId } } }),
    prisma.earnAward.findMany({
      where: { bountyId },
      select: { id: true, reward: true, rewardedAt: true, rewardNote: true, submission: { select: { id: true, contributor: { select: { name: true } } } } },
      orderBy: { id: 'asc' },
      skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
    }),
    prisma.earnStage.findFirst({
      where: { bountyId }, orderBy: { position: 'desc' },
      select: { _count: { select: { submissions: { where: { status: 'approved' } } } } },
    }),
  ])
  return { submitted, selected: final?._count.submissions ?? 0, rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}

export async function listMySubmissions(page: number) {
  const user = await requireUser()
  const rows = await prisma.earnSubmission.findMany({
    where: { contributorId: user.id, stage: historicalStage },
    select: {
      id: true, status: true, revision: true, createdAt: true, award: { select: { id: true } },
      stage: { select: { title: true, position: true, bounty: { select: { id: true, title: true, cancelledAt: true, resultsAnnouncedAt: true, _count: { select: { stages: true } } } } } },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
  })
  return {
    rows: rows.slice(0, EARN_PAGE_SIZE).map((row) => ({
      ...row,
      status: ownerSubmissionStatus(row.status, row.stage.position === row.stage.bounty._count.stages && !row.stage.bounty.resultsAnnouncedAt),
      award: row.stage.bounty.resultsAnnouncedAt ? row.award : null,
    })),
    hasMore: rows.length > EARN_PAGE_SIZE,
  }
}
