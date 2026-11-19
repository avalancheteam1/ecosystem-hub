import 'server-only'
import type { EarnSubmissionStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requirePermission, requireUser } from '@/lib/guards'
import { EARN_PAGE_SIZE } from './rules'
import { bountyIdSchema } from './schemas'

// Cancelled listings leave the public catalog but their owned receipts and staff history remain readable.
const historicalStage = { bounty: { OR: [{ publishedAt: { not: null } }, { cancelledAt: { not: null } }] } } satisfies Prisma.EarnStageWhereInput
const evidenceFields = {
  number: true, notes: true, links: true, pullRequests: true, changeNote: true,
  termsVersion: true, acceptedAt: true, withdrawnAt: true, withdrawalReason: true,
} satisfies Prisma.EarnSubmissionRevisionSelect

export async function getContributorProgress(bountyId: string, stageId: string, page: number) {
  const user = await requireUser()
  const where = { contributorId: user.id, stage: { ...historicalStage, bountyId } }
  const [attempts, rows] = await Promise.all([
    prisma.earnSubmission.groupBy({ by: ['stageId', 'status'], where }),
    prisma.earnSubmission.findMany({
      where: { ...where, stageId },
      select: { id: true, status: true, revision: true, createdAt: true, award: { select: { id: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * EARN_PAGE_SIZE, take: EARN_PAGE_SIZE + 1,
    }),
  ])
  return { attempts, rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}

export async function getOwnReceipt(bountyId: string, id: string, page: number) {
  const user = await requireUser()
  if (!bountyIdSchema.safeParse(bountyId).success || !bountyIdSchema.safeParse(id).success) return null
  const row = await prisma.earnSubmission.findUnique({
    where: { id, contributorId: user.id, stage: { ...historicalStage, bountyId } },
    select: {
      id: true, status: true, revision: true, version: true,
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
  // Decisions and messages that could expose a private final selection are withheld.
  const reviews = await prisma.earnReview.findMany({
    where: {
      submissionId: id,
      revision: { in: row.revisions.map((revision) => revision.number) },
      ...(final && !row.award ? { decision: { not: 'approved' as const } } : {}),
    },
    select: { id: true, revision: true, decision: true, feedback: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const stageApproved = !final && !!await prisma.earnSubmission.findFirst({
    where: { stageId: row.stage.id, contributorId: user.id, status: 'approved' },
    select: { id: true },
  })
  return { ...row, award: pendingAnnouncement ? null : row.award, final, stageApproved, reviews, hasMore: row.revisions.length > EARN_PAGE_SIZE, revisions: row.revisions.slice(0, EARN_PAGE_SIZE) }
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
      id: true, contributorId: true, status: true, revision: true, version: true, contributor: { select: { name: true } },
      stage: { select: { title: true, position: true, deliverables: true, bountyId: true, bounty: { select: {
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
  return { row: { ...row, revisions: row.revisions.slice(0, EARN_PAGE_SIZE) }, user, reviews, hasMore: row.revisions.length > EARN_PAGE_SIZE }
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
  return { rows: rows.slice(0, EARN_PAGE_SIZE), hasMore: rows.length > EARN_PAGE_SIZE }
}
