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
import { newSubmissionError, previousStageError, revisionAllowed, reviewError, stageEvidenceError } from './stage-rules'
import { lockBounty } from './write-lock'

async function workflow(tx: Prisma.TransactionClient, bountyId: string) {
  await lockBounty(tx, bountyId)
  const bounty = await tx.earnBounty.findUnique({
    where: { id: bountyId, publishedAt: { not: null }, cancelledAt: null },
    select: {
      deadline: true, resultsAnnouncedAt: true, terms: true, termsVersion: true, githubIssueUrl: true, reward: true, revision: true,
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
    select: { id: true, stageId: true, revision: true, version: true, status: true },
  })
  if (!entry) throw new ForbiddenError('This submission is unavailable.')
  if (entry.version !== version) throw new ActionError('This submission changed. Reload and try again.')
  return entry
}

export const submitStage = action({
  permission: 'user',
  schema: z.strictObject({ bountyId: bountyIdSchema, stageId: bountyIdSchema, id: bountyIdSchema, evidence: revisionEvidenceSchema }),
}, async ({ bountyId, stageId, id, evidence }, user) => {
  await requireFlag('earn')
  limitContributorWrite(user.id)
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, bountyId)
    checkSubmissionWindow(bounty)
    const stage = bounty.stages.find((item) => item.id === stageId)
    if (!stage) throw new ActionError('This stage is unavailable.')
    const entries = await tx.earnSubmission.findMany({
      where: { contributorId: user.id, stage: { bountyId } },
      select: { stageId: true, status: true },
    })
    const blocked = previousStageError(stage, bounty.stages, entries) ?? newSubmissionError(stage, bounty.stages.at(-1)?.id === stageId, entries)
    if (blocked) throw new ActionError(blocked)
    const data = revisionData(evidence, stage, bounty)
    const created = await tx.earnSubmission.createMany({ data: { id, stageId, contributorId: user.id }, skipDuplicates: true })
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
    const stage = bounty.stages.find((item) => item.id === entry.stageId)
    if (!stage || !revisionAllowed(stage.submissionPolicy, entry.status)) throw new ActionError('This stage does not allow another revision.')
    if (
      stage.submissionPolicy !== 'multiple' &&
      stage.id !== bounty.stages.at(-1)?.id &&
      await tx.earnSubmission.findFirst({ where: { stageId: stage.id, contributorId: user.id, status: 'approved' }, select: { id: true } })
    ) {
      throw new ActionError('This stage is already approved.')
    }
    const data = revisionData(evidence, stage, bounty)
    const number = entry.revision + 1
    await tx.earnSubmission.update({ where: { id }, data: { status: 'pending', revision: number, version: { increment: 1 } } })
    await tx.earnSubmissionRevision.create({ data: { ...data, submissionId: id, number, changeNote } })
    await recordAudit({ actorId: user.id, action: 'earn.submission.revise', entityType: 'EarnSubmission', entityId: id, before: { revision: entry.revision }, after: { revision: number, termsVersion: data.termsVersion } }, tx)
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
    if (entry.status === 'approved' || entry.status === 'withdrawn') throw new ActionError('This submission cannot be withdrawn.')
    await tx.earnSubmission.update({ where: { id }, data: { status: 'withdrawn', version: { increment: 1 } } })
    await tx.earnSubmissionRevision.update({
      where: { submissionId_number: { submissionId: id, number: entry.revision } },
      data: { withdrawnAt: new Date(), withdrawalReason: reason },
    })
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
      select: { contributorId: true, stageId: true, version: true, revision: true, status: true },
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
    await tx.earnSubmission.update({ where: { id }, data: { status: decision, version: { increment: 1 } } })
    if (isFinal && (decision === 'approved' || removingSelection)) {
      // A confirmation rendered before this selection must be reviewed again.
      await tx.earnBounty.update({ where: { id: bountyId }, data: { revision: { increment: 1 } } })
    }
    await tx.earnReview.create({ data: { submissionId: id, reviewerId: user.id, revision: entry.revision, decision, feedback: feedback || null, internalNote: internalNote || null } })
    await recordAudit({ actorId: user.id, action: removingSelection ? 'earn.submission.unselect' : 'earn.submission.review', entityType: 'EarnSubmission', entityId: id, before: { status: entry.status }, after: { revision: entry.revision, status: decision } }, tx)
  })
  refreshWorkflow(bountyId, id)
  return { id }
})

export const announceAwards = action({
  permission: 'superAdmin',
  schema: bountyRevisionSchema.extend({ note: z.string().trim().max(6000) }),
}, async ({ id, revision, note }, user) => {
  await prisma.$transaction(async (tx) => {
    const bounty = await workflow(tx, id)
    const final = bounty.stages.at(-1)
    if (!final || bounty.resultsAnnouncedAt || bounty.revision !== revision || bounty.deadline > new Date()) {
      throw new ActionError('Results can be announced once, after the deadline.')
    }
    const winners = await tx.earnSubmission.findMany({ where: { stageId: final.id, status: 'approved' }, select: { id: true } })
    if (!winners.length && !note) throw new ActionError('Explain why there are no award recipients.')
    if (winners.length) await tx.earnAward.createMany({ data: winners.map((winner) => ({ bountyId: id, submissionId: winner.id, reward: bounty.reward })) })
    await tx.earnBounty.update({
      where: { id },
      data: { resultsAnnouncedAt: new Date(), resultsNote: note || null, revision: { increment: 1 } },
    })
    await recordAudit({ actorId: user.id, action: 'earn.results.announce', entityType: 'EarnBounty', entityId: id, after: { awards: winners.length } }, tx)
  })
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
