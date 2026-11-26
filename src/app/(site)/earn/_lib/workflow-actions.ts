'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { requireFlag } from '@/lib/flag-store'
import { can } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'
import { bountyIdSchema, bountyRevisionSchema, requiredNote, reviewSchema, revisionEvidenceSchema, submissionRefSchema } from './schemas'
import { activeContinuationStatuses, newSubmissionError, ownerSubmissionStatus, revisionAllowed, reviewError, stageEvidenceError } from './stage-rules'
import { approvedNoticeCopy, snapshotResultNotices, sendResultNotices } from './result-notices'
import { lockBounty } from './write-lock'

async function workflow(tx: Prisma.TransactionClient, bountyId: string) {
  await lockBounty(tx, bountyId)
  const bounty = await tx.earnBounty.findUnique({
    where: { id: bountyId, publishedAt: { not: null }, cancelledAt: null },
    select: {
      deadline: true, resultsAnnouncedAt: true, terms: true, termsVersion: true, githubIssueUrl: true, reward: true, revision: true, updatedAt: true,
      stages: {
        orderBy: { position: 'asc' },
        select: { id: true, position: true, title: true, requiresPrevApproval: true, requiresPullRequest: true, submissionPolicy: true, approvalLimit: true },
      },
    },
  })
  if (!bounty) throw new ActionError('This bounty is unavailable.')
  return bounty
}

function checkSubmissionWindow(bounty: { deadline: Date; resultsAnnouncedAt: Date | null }) {
  if (bounty.resultsAnnouncedAt || bounty.deadline <= new Date()) throw new ActionError('Submissions are closed.')
}

function revisionData(
  evidence: z.output<typeof revisionEvidenceSchema>,
  stage: { requiresPullRequest: boolean },
  bounty: { githubIssueUrl: string | null; terms: string | null; termsVersion: number },
) {
  if (!bounty.terms || bounty.termsVersion !== evidence.termsVersion) {
    throw new ActionError('Reload and accept the current bounty terms before submitting.')
  }
  const error = stageEvidenceError(stage.requiresPullRequest, bounty.githubIssueUrl, evidence.pullRequests)
  if (error) throw new ActionError(error)
  return { notes: evidence.notes, links: evidence.links, pullRequests: evidence.pullRequests, termsVersion: evidence.termsVersion }
}

function refreshWorkflow(bountyId: string, submissionId?: string) {
  revalidatePath(`/earn/${bountyId}`)
  revalidatePath('/admin/earn/review')
  revalidatePath(`/admin/earn/${bountyId}`)
  if (submissionId) revalidatePath(`/admin/earn/review/${submissionId}`)
}

function limitContributorWrite(userId: string) {
  if (!rateLimit(`earn-work:${userId}`, { limit: 30, windowMs: 60_000 }).ok) {
    throw new ActionError('Too many updates. Wait a minute and try again.')
  }
}

async function getOwnedSubmission(tx: Prisma.TransactionClient, id: string, bountyId: string, contributorId: string, version: number) {
  const entry = await tx.earnSubmission.findUnique({
    where: { id, contributorId, stage: { bountyId } },
    select: { id: true, stageId: true, revision: true, version: true, ownerVersion: true, status: true, previousSubmissionId: true },
  })
  if (!entry) throw new ForbiddenError('This submission is unavailable.')
  if ((entry.ownerVersion ?? entry.version) !== version) throw new ActionError('This submission changed. Reload and try again.')
  return entry
}

async function assertContinuation(tx: Prisma.TransactionClient, input: {
  bountyId: string; contributorId: string; stageId: string; previousStageId: string; previousSubmissionId?: string; entryId?: string
}) {
  const { bountyId, contributorId, stageId, previousStageId, previousSubmissionId, entryId } = input
  if (!previousSubmissionId) throw new ActionError('Choose an approved submission from the previous stage.')
  const parent = await tx.earnSubmission.findUnique({
    where: { id: previousSubmissionId },
    select: { contributorId: true, stageId: true, status: true, stage: { select: { bountyId: true } } },
  })
  if (!parent || parent.contributorId !== contributorId || parent.stageId !== previousStageId ||
      parent.stage.bountyId !== bountyId || parent.status !== 'approved') {
    throw new ActionError('Choose an approved submission from the previous stage.')
  }
  const occupied = await tx.earnSubmission.count({
    where: { previousSubmissionId, stageId, contributorId, status: { in: [...activeContinuationStatuses] }, ...(entryId ? { id: { not: entryId } } : {}) },
  })
  if (occupied) throw new ActionError('This previous submission already has an active continuation.')
}

function advanceOwnerVersion(entry: { ownerVersion: number | null }) {
  // Until the first private decision the two versions advance together.
  return entry.ownerVersion != null ? { ownerVersion: { increment: 1 } } : {}
}

async function invalidateShortlist(tx: Prisma.TransactionClient, bountyId: string, updatedAt: Date) {
  await tx.earnBounty.update({ where: { id: bountyId }, data: { revision: { increment: 1 }, updatedAt } })
}

export const submitStage = action({
  permission: 'user',
  schema: z.strictObject({ bountyId: bountyIdSchema, stageId: bountyIdSchema, id: bountyIdSchema, evidence: revisionEvidenceSchema, previousSubmissionId: bountyIdSchema.optional() }),
}, async ({ bountyId, stageId, id, evidence, previousSubmissionId }, user) => {
  await requireFlag('earn')
  limitContributorWrite(user.id)
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, bountyId)
    checkSubmissionWindow(bounty)
    const index = bounty.stages.findIndex((item) => item.id === stageId)
    const stage = bounty.stages[index]
    if (!stage) throw new ActionError('This stage is unavailable.')
    const previous = bounty.stages[index - 1]
    if (previous) {
      await assertContinuation(tx, { bountyId, contributorId: user.id, stageId, previousStageId: previous.id, previousSubmissionId })
    } else if (previousSubmissionId) {
      throw new ActionError('The first stage does not accept a previous submission.')
    }
    if (stage.submissionPolicy !== 'multiple') {
      const entries = await tx.earnSubmission.findMany({
        where: { contributorId: user.id, stageId },
        select: { stageId: true, status: true },
      })
      const blocked = newSubmissionError(stage, index === bounty.stages.length - 1, entries)
      if (blocked) throw new ActionError(blocked)
    }
    const data = revisionData(evidence, stage, bounty)
    const created = await tx.earnSubmission.createMany({
      data: { id, stageId, contributorId: user.id, ...(previousSubmissionId ? { previousSubmissionId } : {}) },
      skipDuplicates: true,
    })
    if (!created.count) throw new ActionError('This submission was already received. Reload your receipt.')
    await tx.earnSubmissionRevision.create({ data: { ...data, submissionId: id, number: 1 } })
    await recordAudit({ actorId: user.id, action: 'earn.submission.create', entityType: 'EarnSubmission', entityId: id, after: { bountyId, stageId, revision: 1, termsVersion: data.termsVersion } }, tx)
  })
  refreshWorkflow(bountyId, id)
  return { id }
})

export const reviseStage = action({
  permission: 'user',
  schema: submissionRefSchema.extend({ changeNote: requiredNote, evidence: revisionEvidenceSchema }),
}, async ({ bountyId, id, version, changeNote, evidence }, user) => {
  await requireFlag('earn')
  limitContributorWrite(user.id)
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, bountyId)
    checkSubmissionWindow(bounty)
    const entry = await getOwnedSubmission(tx, id, bountyId, user.id, version)
    const index = bounty.stages.findIndex((item) => item.id === entry.stageId)
    const stage = bounty.stages[index]
    const final = index === bounty.stages.length - 1
    if (!stage || !revisionAllowed(stage.submissionPolicy, ownerSubmissionStatus(entry.status, final))) {
      throw new ActionError('This stage does not allow another revision.')
    }
    if (
      stage.submissionPolicy !== 'multiple' &&
      !final &&
      await tx.earnSubmission.findFirst({ where: { stageId: stage.id, contributorId: user.id, status: 'approved' }, select: { id: true } })
    ) {
      throw new ActionError('This stage is already approved.')
    }
    if (entry.previousSubmissionId && (entry.status === 'withdrawn' || entry.status === 'rejected')) {
      const previous = bounty.stages[index - 1]
      if (!previous) throw new ActionError('This submission has an invalid previous stage.')
      await assertContinuation(tx, {
        bountyId, contributorId: user.id, stageId: stage.id, previousStageId: previous.id,
        previousSubmissionId: entry.previousSubmissionId, entryId: id,
      })
    }
    const data = revisionData(evidence, stage, bounty)
    const number = entry.revision + 1
    const displacesSelection = final && entry.status === 'approved'
    await tx.earnSubmission.update({ where: { id }, data: { status: 'pending', revision: number, version: { increment: 1 }, ...advanceOwnerVersion(entry) } })
    await tx.earnSubmissionRevision.create({ data: { ...data, submissionId: id, number, changeNote } })
    if (displacesSelection) await invalidateShortlist(tx, bountyId, bounty.updatedAt)
    await recordAudit({
      actorId: user.id, action: 'earn.submission.revise', entityType: 'EarnSubmission', entityId: id,
      before: { revision: entry.revision, ...(displacesSelection ? { status: entry.status } : {}) },
      after: { revision: number, termsVersion: data.termsVersion, ...(displacesSelection ? { status: 'pending' } : {}) },
    }, tx)
  })
  refreshWorkflow(bountyId, id)
  return { id }
})

export const withdrawStage = action({
  permission: 'user',
  schema: submissionRefSchema.extend({ reason: requiredNote }),
}, async ({ bountyId, id, version, reason }, user) => {
  await requireFlag('earn')
  limitContributorWrite(user.id)
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, bountyId)
    checkSubmissionWindow(bounty)
    const entry = await getOwnedSubmission(tx, id, bountyId, user.id, version)
    const final = entry.stageId === bounty.stages.at(-1)?.id
    const status = ownerSubmissionStatus(entry.status, final)
    if (status === 'approved' || status === 'withdrawn') throw new ActionError('This submission cannot be withdrawn.')
    await tx.earnSubmission.update({ where: { id }, data: { status: 'withdrawn', version: { increment: 1 }, ...advanceOwnerVersion(entry) } })
    await tx.earnSubmissionRevision.update({
      where: { submissionId_number: { submissionId: id, number: entry.revision } },
      data: { withdrawnAt: new Date(), withdrawalReason: reason },
    })
    if (final && entry.status === 'approved') await invalidateShortlist(tx, bountyId, bounty.updatedAt)
    await recordAudit({ actorId: user.id, action: 'earn.submission.withdraw', entityType: 'EarnSubmission', entityId: id, before: { status: entry.status }, after: { revision: entry.revision, status: 'withdrawn' } }, tx)
  })
  refreshWorkflow(bountyId, id)
  return { id }
})

export const reviewStage = action({ permission: 'earn.review', schema: reviewSchema }, async ({ bountyId, id, version, decision, feedback, internalNote }, user) => {
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, bountyId)
    if (bounty.resultsAnnouncedAt) throw new ActionError('Results have already been announced.')
    const entry = await tx.earnSubmission.findUnique({
      where: { id, stage: { bountyId } },
      select: { contributorId: true, stageId: true, version: true, ownerVersion: true, revision: true, status: true, updatedAt: true },
    })
    if (!entry) throw new ActionError('Submission not found.')
    if (entry.contributorId === user.id) throw new ForbiddenError('You cannot review your own submission.')
    if (entry.version !== version) throw new ActionError('This submission changed. Reload and try again.')
    const stage = bounty.stages.find((item) => item.id === entry.stageId)
    if (!stage) throw new ActionError('Stage not found.')
    const isFinal = stage.id === bounty.stages.at(-1)?.id
    const removingSelection = isFinal && entry.status === 'approved' && decision === 'needs_review'
    if (isFinal && (decision === 'approved' || removingSelection) && !can(user, 'earn.finalize')) {
      throw new ForbiddenError('You do not have permission to select award recipients.')
    }
    if (removingSelection && (!internalNote || feedback)) throw new ActionError('Add a private reason for removing the selection.')
    const error = reviewError(entry.status, decision, isFinal, bounty.deadline, new Date())
    if (error) throw new ActionError(error)
    if (decision === 'approved') {
      if (isFinal && stage.approvalLimit === null) throw new ActionError('Set an approval limit before selecting award recipients.')
      if (
        stage.submissionPolicy !== 'multiple' &&
        !isFinal &&
        await tx.earnSubmission.findFirst({ where: { stageId: stage.id, contributorId: entry.contributorId, status: 'approved' }, select: { id: true } })
      ) {
        throw new ActionError('This contributor already has an approval for the stage.')
      }
      if (stage.approvalLimit !== null && await tx.earnSubmission.count({ where: { stageId: stage.id, status: 'approved' } }) >= stage.approvalLimit) {
        throw new ActionError('This stage has reached its approval limit.')
      }
    }
    const privateChange = isFinal && (decision === 'approved' || removingSelection)
    await tx.earnSubmission.update({
      where: { id },
      data: {
        status: decision, version: { increment: 1 },
        ...(privateChange ? { ownerVersion: entry.ownerVersion ?? entry.version, updatedAt: entry.updatedAt } : advanceOwnerVersion(entry)),
      },
    })
    if (privateChange) await invalidateShortlist(tx, bountyId, bounty.updatedAt)
    await tx.earnReview.create({ data: { submissionId: id, reviewerId: user.id, revision: entry.revision, decision, feedback: feedback || null, internalNote: internalNote || null } })
    await recordAudit({ actorId: user.id, action: removingSelection ? 'earn.submission.unselect' : 'earn.submission.review', entityType: 'EarnSubmission', entityId: id, before: { status: entry.status }, after: { revision: entry.revision, status: decision } }, tx)
  })
  refreshWorkflow(bountyId, id)
  return { id }
})

export const announceAwards = action({
  permission: 'superAdmin',
  schema: bountyRevisionSchema.extend({ note: z.string().trim().max(6000), closeNow: z.boolean().default(false) }),
}, async ({ id, revision, note, closeNow }, user) => {
  const copy = approvedNoticeCopy()
  const notices = await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, id)
    const final = bounty.stages.at(-1)
    if (!final || bounty.resultsAnnouncedAt || bounty.revision !== revision) throw new ActionError('The bounty changed or already has results. Reload before announcing.')
    const now = new Date()
    if (bounty.deadline > now && !closeNow) throw new ActionError('Confirm closing submissions now before announcing early.')
    const winners = await tx.earnSubmission.findMany({ where: { stageId: final.id, status: 'approved' }, select: { id: true } })
    if (!winners.length && !note) throw new ActionError('Explain why there are no award recipients.')
    if (winners.length) await tx.earnAward.createMany({ data: winners.map((winner) => ({ bountyId: id, submissionId: winner.id, reward: bounty.reward })) })
    await tx.earnBounty.update({
      where: { id },
      data: { resultsAnnouncedAt: now, resultsNote: note || null, revision: { increment: 1 } },
    })
    await recordAudit({ actorId: user.id, action: 'earn.results.announce', entityType: 'EarnBounty', entityId: id, after: { awards: winners.length } }, tx)
    return copy ? snapshotResultNotices(tx, final.id) : []
  })
  if (copy) await sendResultNotices(id, notices, copy)
  refreshWorkflow(id)
  revalidatePath('/earn')
  return { id }
})

export const recordEarnReward = action({
  permission: 'earn.publish',
  schema: z.strictObject({ bountyId: bountyIdSchema, id: bountyIdSchema, note: requiredNote }),
}, async ({ bountyId, id, note }, user) => {
  await prisma.$transaction(async (tx) => {
    await lockBounty(tx, bountyId)
    const result = await tx.earnAward.updateMany({
      where: { id, bountyId, rewardedAt: null, bounty: { resultsAnnouncedAt: { not: null } } },
      data: { rewardedAt: new Date(), rewardNote: note },
    })
    if (!result.count) throw new ActionError('This reward was already recorded or is unavailable.')
    await recordAudit({ actorId: user.id, action: 'earn.reward.record', entityType: 'EarnAward', entityId: id, after: { bountyId, recorded: true } }, tx)
  })
  refreshWorkflow(bountyId)
  return { id }
})

export const cancelEarnBounty = action({
  permission: 'superAdmin',
  schema: bountyRevisionSchema.extend({ reason: requiredNote }),
}, async ({ id, revision, reason }, user) => {
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, id)
    if (bounty.resultsAnnouncedAt || bounty.revision !== revision) throw new ActionError('This bounty changed or has announced results.')
    await tx.earnBounty.update({ where: { id }, data: { publishedAt: null, cancelledAt: new Date(), cancellationReason: reason, revision: { increment: 1 } } })
    await recordAudit({ actorId: user.id, action: 'earn.listing.cancel', entityType: 'EarnBounty', entityId: id, after: { cancelled: true, revision: revision + 1 } }, tx)
  })
  refreshWorkflow(id)
  revalidatePath('/earn')
  revalidatePath('/sitemap.xml')
  return { id }
})
