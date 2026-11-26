import 'server-only'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma, prismaDatabaseUrl } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import type { CurrentUser } from '@/lib/session'
import { FLAGS, type Flag } from '@/lib/flags'
import { recordProjectActivity, type ProjectActivityEvent } from '@/lib/project-activity'
import { canEditProject, missingForSubmission, planSeal } from '@/lib/project-submission'
import { committeeReviewerAccess, readCommitteeRoster } from './committee-config'
import { committeeAwardTerms, continuousIntakePaused, hasDemoProof, id, missingDemo, projectReviewChanged, roundClosedForSubmission, roundNotAccepting, stateSchema, syntheticPayout, terms, text, type IntakeAnswers, type PlanIntake, type Command, type GrantState, type payoutDestinationSchema, type ReviewedProject } from './schemas'
import { milestoneFirstEnabled, shortIntakeEnabled, syntheticPayoutEnabled } from './config'
import { projectReviewSnapshot } from './reviewed-project'
import { assertReviewer } from './staff'
import { commandPermission, initialState, issuedPayoutAward, mayCommand, payoutConfirmationClosed, transition } from './rules'
import {
  existingGrant, formatReapplicationDate, grantIntakeHistory, hasChangedDemo, hasChangedRoadmapScope,
  hasDifferentRoadmapDeliverable, missingScopeChange, priorDecisionUnverified, priorScope, reapplicationEligibility,
} from './reapplication'

export const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
const conflict = () => new ActionError('This record changed. Refresh and review the latest version before saving.')
const transaction = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
const isWriteConflict = (error: unknown) => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
) || (
  // adapter-pg can expose a commit-time conflict before Prisma normalizes it.
  error instanceof Error && error.name === 'DriverAdapterError' &&
  typeof error.cause === 'object' && error.cause !== null &&
  'kind' in error.cause && error.cause.kind === 'TransactionWriteConflict'
)

async function projectAccess(tx: Prisma.TransactionClient, projectId: string, user: CurrentUser) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true, currentVersionId: true, members: { where: { userId: user.id }, select: { role: true } } },
  })
  return { project, role: project?.members[0]?.role ?? null }
}

export async function confirmGrantPayoutDestination(input: z.infer<typeof payoutDestinationSchema>, user: CurrentUser) {
  if (!syntheticPayoutEnabled(prismaDatabaseUrl)) throw new ActionError('Payout destination confirmation is unavailable.')
  const { applicationId, revision, awardId, address } = input
  const alreadyConfirmed = () => new ActionError('The test payout address is already confirmed and cannot be replaced.')
  try {
    await transaction(async (tx) => {
      const row = await tx.grantApplication.findUnique({
        where: { id: applicationId },
        select: { projectId: true, projectVersionId: true, revision: true, state: true },
      })
      if (!row) throw new ForbiddenError('Grant access denied')
      const { project, role } = await projectAccess(tx, row.projectId, user)
      if (!canEditProject(role ?? '')) throw new ForbiddenError('Only a grant project owner or writer can confirm its payout address.')
      if (!project || project.archivedAt) throw new ActionError('This project is archived or unavailable.')
      if (row.revision !== revision) throw conflict()
      const state = stateSchema.parse(row.state)
      const award = issuedPayoutAward(state, row.projectVersionId)
      if (!award) throw new ActionError('An issued award is required before confirming a payout address.')
      if (award.id !== awardId) throw conflict()
      if (payoutConfirmationClosed(state)) throw new ActionError('Payout address confirmation has closed for this grant.')

      // Coordinate with aggregate writes without putting the private receipt in the aggregate.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM grant_applications WHERE id = ${applicationId} AND revision = ${revision} FOR NO KEY UPDATE
      `
      if (!locked.length) throw conflict()
      if (await tx.grantPayoutDestination.findUnique({ where: { applicationId }, select: { applicationId: true } }))
        throw alreadyConfirmed()
      await tx.grantPayoutDestination.create({
        data: { applicationId, awardId, network: syntheticPayout.network, asset: syntheticPayout.asset, address },
        select: { applicationId: true },
      })
      await writeAudit(tx, {
        actorId: user.id, action: 'grant.confirm_payout_destination', entityType: 'GrantApplication', entityId: applicationId,
        after: { awardId, confirmed: true },
      })
    })
  } catch (error) {
    if (error instanceof ActionError) throw error
    if (isWriteConflict(error)) throw conflict()
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw alreadyConfirmed()
    // Prisma and driver error details may include the address. The action logs only this message.
    throw new Error('Grant payout destination confirmation failed')
  }
}

async function pinVersion(tx: Prisma.TransactionClient, projectId: string, versionId: string, requireDemo = false, reviewed?: ReviewedProject) {
  const version = await tx.projectVersion.findUnique({ where: { id: versionId } })
  if (!version || version.projectId !== projectId) throw new ActionError('Save a project version first')
  if (requireDemo && !hasDemoProof(version.demoLinks)) throw new ActionError(missingDemo)
  const missing = missingForSubmission(version)
  if (missing.length) throw new ActionError(`Complete your project first: ${missing.join(', ')}`)
  if (reviewed && (reviewed.versionId !== version.id || reviewed.fingerprint !== projectReviewSnapshot(version).fingerprint))
    throw new ActionError(projectReviewChanged)
  if (planSeal(version) === 'seal-draft')
    await tx.projectVersion.updateMany({
      where: { id: version.id, sealedAt: null },
      data: { sealedAt: new Date(), note: 'Sealed for a team1 grant application' },
    })
  return version.id
}

// The live roadmap supplies the selection. The submitted terms retain the title
// and date even when the project team later edits or removes its roadmap entry.
async function resolveMilestone<A extends IntakeAnswers>(tx: Prisma.TransactionClient, projectId: string, answers: A, required: boolean): Promise<A> {
  if (answers.intakeVersion !== undefined) {
    const milestones = answers.intakeVersion === 3 ? answers.milestones : answers.milestone ? [answers.milestone] : []
    const roadmap = milestones.filter((m) => m.source === 'roadmap')
    if (!roadmap.length) return answers
    const live = await tx.projectMilestone.findMany({
      where: { id: { in: roadmap.map((m) => m.id) }, projectId, status: { in: ['planned', 'in_progress'] } },
      select: { id: true, title: true, targetDate: true },
    })
    const today = new Date().toISOString().slice(0, 10)
    if (roadmap.some((m) => !live.some((item) => item.id === m.id &&
      item.title === m.title && item.targetDate === m.due && item.targetDate >= today))) {
      throw new ActionError('The roadmap milestone changed or is no longer eligible. Refresh the roadmap and review the updated commitment before continuing.')
    }
    return answers
  }
  if (required && !answers.whyGrant?.trim())
    throw new ActionError('Explain why this grant would make a difference before submitting.')
  if (!answers.projectMilestoneId) {
    if (required) throw new ActionError('Choose a milestone from your Hub project roadmap before submitting.')
    return { ...answers, terms: { ...answers.terms, title: '', due: '' } }
  }
  const milestone = await tx.projectMilestone.findFirst({
    where: { id: answers.projectMilestoneId, projectId, status: { in: ['planned', 'in_progress'] } },
    select: { title: true, targetDate: true },
  })
  if (!milestone || milestone.targetDate < new Date().toISOString().slice(0, 10))
    throw new ActionError('That milestone is no longer selectable. Update the Hub project roadmap or choose another milestone.')
  if ((required || answers.terms.title || answers.terms.due) && (answers.terms.title !== milestone.title || answers.terms.due !== milestone.targetDate))
    throw new ActionError('The milestone changed on the project roadmap. Refresh and review its current title and date before submitting.')
  return { ...answers, terms: { ...answers.terms, title: milestone.title, due: milestone.targetDate } }
}

async function grantFlagOn(tx: Prisma.TransactionClient, key: Flag) {
  // Read the same flag as public discovery directly on writes to avoid a stale rollout decision.
  const flag = await tx.featureFlag.findUnique({ where: { key }, select: { enabled: true } })
  return flag?.enabled ?? FLAGS[key].default
}

async function checkReapplication(tx: Prisma.TransactionClient, history: Awaited<ReturnType<typeof grantIntakeHistory>>, now: Date) {
  if (history.unverified) throw new ActionError(priorDecisionUnverified)
  if (!history.latest) return
  if (!(await grantFlagOn(tx, 'miniGrantsReapplication'))) throw new ActionError('Mini Grants reapplication is paused.')
  const eligibility = reapplicationEligibility(history.latest, now)
  if (eligibility?.waiting)
    throw new ActionError(`You can reapply from ${formatReapplicationDate(eligibility.eligibleAt)}.`)
}

async function demoLinksForVersion(tx: Prisma.TransactionClient, projectId: string, versionId: string) {
  const version = await tx.projectVersion.findFirst({ where: { id: versionId, projectId }, select: { demoLinks: true } })
  if (!version) throw new ActionError('Save a project version first')
  return version.demoLinks
}

async function insertGrant(tx: Prisma.TransactionClient, projectId: string, projectVersionId: string, roundId: string | null, state: GrantState, actorId: string) {
  const application = await tx.grantApplication.create({
    data: { roundId, projectId, projectVersionId, status: state.status, state: json(state) },
    select: { id: true },
  })
  await tx.grantRevision.create({
    data: { applicationId: application.id, number: 0, actorId, kind: 'create', state: json(state) },
  })
  return application
}

export async function startGrant(projectId: string, user: CurrentUser) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await transaction(async (tx) => {
        const { project, role } = await projectAccess(tx, projectId, user)
        if (!canEditProject(role ?? '')) throw new ForbiddenError('Only this project owner or a writer may apply')
        if (!project?.currentVersionId || project.archivedAt) throw new ActionError('Choose an active project with a saved version')
        if (!(await grantFlagOn(tx, 'miniGrantsIntake'))) throw new ActionError(continuousIntakePaused)
        // A competing insert after the project-wide predicate read conflicts.
        // Retrying in a fresh transaction finds the winning draft.
        const now = new Date()
        const history = await grantIntakeHistory(tx, projectId)
        const existing = history.active.find(({ roundId }) => roundId === null)
        if (existing && existing.status !== 'draft') return { id: existing.id, created: false }
        if (history.award || history.active.some(({ id }) => id !== existing?.id)) throw new ActionError(existingGrant)
        await checkReapplication(tx, history, now)
        if (existing) return { id: existing.id, created: false }
        if (history.latest) {
          const previous = await priorScope(tx, projectId, history.latest)
          const candidateDemoLinks = await demoLinksForVersion(tx, projectId, project.currentVersionId)
          if (!hasChangedDemo(previous.demoLinks, candidateDemoLinks)) {
            const roadmap = await tx.projectMilestone.findMany({
              where: { projectId, status: { in: ['planned', 'in_progress'] }, targetDate: { gte: now.toISOString().slice(0, 10) } },
              select: { id: true, title: true },
            })
            if (!roadmap.some((item) => hasDifferentRoadmapDeliverable(previous.milestones, item))) throw new ActionError(missingScopeChange)
          }
        } else if (history.latestContinuous) {
          return { id: history.latestContinuous.id, created: false }
        }
        const state = initialState({ intakeVersion: 3, amountMinor: null, summary: '', milestones: [] })
        const row = await insertGrant(tx, projectId, project.currentVersionId, null, state, user.id)
        await writeAudit(tx, {
          actorId: user.id,
          action: 'grant.create',
          entityType: 'GrantApplication',
          entityId: row.id,
          after: { projectId, roundId: null, submitted: false, revision: 0 },
        })
        return { id: row.id, created: true }
      })
    } catch (error) {
      if (!isWriteConflict(error)) throw error
    }
  }
  throw conflict()
}

export async function createGrant(projectId: string, roundId: string, answers: Exclude<IntakeAnswers, PlanIntake>, user: CurrentUser, submit = false) {
  if (answers.intakeVersion === 2 && !shortIntakeEnabled())
    throw new ActionError('The short form is currently unavailable. Reload to start a new application.')
  return transaction(async (tx) => {
    const { project, role } = await projectAccess(tx, projectId, user)
    if (!canEditProject(role ?? '')) throw new ForbiddenError('Only this project owner or a writer may apply')
    if (!project?.currentVersionId || project.archivedAt) throw new ActionError('Choose an active project with a saved version')
    if (await grantFlagOn(tx, 'miniGrantsIntake')) throw new ActionError('Start a new application through continuous Mini Grants intake.')
    const history = await grantIntakeHistory(tx, projectId)
    if (history.award || history.active.some(({ roundId }) => roundId === null)) throw new ActionError(existingGrant)
    if (history.unverified) throw new ActionError(priorDecisionUnverified)
    if (history.latest) throw new ActionError('Reapplication for this project uses continuous Mini Grants intake.')
    const round = await tx.grantRound.findFirst({ where: { id: roundId, published: true }, select: { id: true } })
    if (!round) throw new ActionError(roundNotAccepting)
    const initial = initialState(await resolveMilestone(tx, projectId, answers, submit))
    const versionId = submit ? await pinVersion(tx, projectId, project.currentVersionId) : project.currentVersionId
    const state = submit
      ? transition(
          initial,
          {
            kind: 'submit_application', confirm: true,
            ...(initial.answers.intakeVersion === 2 ? { shortAnswers: initial.answers } : {}),
          },
          { id: randomUUID(), actorId: user.id, now: new Date().toISOString(), projectVersionId: versionId, milestoneFirst: milestoneFirstEnabled() },
        )
      : initial
    return insertGrant(tx, projectId, versionId, roundId, state, user.id)
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw conflict()
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ActionError('This project already has an application in this round. Open My applications to continue it.')
    throw error
  })
}

const awardAuthorizationSchema = z.object({
  applicationId: id, revision: z.number().int().nonnegative(), planId: id, actorId: id,
  budget: text.max(2000), authority: text, terms, awardRequestId: id.optional(),
})
const committeeAwardAuthorizationSchema = awardAuthorizationSchema.extend({ terms: committeeAwardTerms })
const planActivity: Partial<Record<Command['kind'], ProjectActivityEvent>> = {
  clear_milestone: 'grant_plan_approved',
  submit_delivery: 'grant_evidence_submitted',
  hold_application: 'grant_held',
  decline_application: 'grant_declined',
  reopen_application: 'grant_reopened',
  issue_award: 'grant_award_issued',
}

export function usesTransactionalGrantAudit(kind: Command['kind']) {
  return kind === 'hold_application' || kind === 'decline_application' || kind === 'issue_award' ||
    kind === 'shortlist_application' || kind === 'request_award_amount' || kind === 'respond_award_amount' || kind === 'vote_award'
}

async function checkCommitteeAccess(tx: Prisma.TransactionClient, roster: NonNullable<Awaited<ReturnType<typeof readCommitteeRoster>>>,
  actorId: string, projectId?: string) {
  // The authenticated actor already passed the current request's review permission check.
  const otherIds = roster.memberIds.filter((id) => id !== actorId)
  const reviewerCount = await tx.user.count({ where: { id: { in: otherIds }, ...committeeReviewerAccess } })
  if (reviewerCount !== otherIds.length)
    throw new ActionError('Every configured Committee reviewer must have grant review access.')
  if (projectId && await tx.projectMember.findFirst({
    where: { projectId, userId: { in: roster.memberIds } },
    select: { id: true },
  })) throw new ForbiddenError('A Committee seat has a project membership conflict')
}

// Only a server-side caller can supply authorization. The public action has no
// approved source for it yet. Bind any receipt to the exact assessed case.
export async function mutateGrant(applicationId: string, revision: number, command: Command, user: CurrentUser,
  authorization?: z.input<typeof awardAuthorizationSchema>) {
  try {
    return await transaction(async (tx) => {
      const row = await tx.grantApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, projectId: true, projectVersionId: true, revision: true, state: true, roundId: true, round: { select: { published: true } } },
      })
      if (!row) throw new ForbiddenError('Grant access denied')
      const { project, role } = await projectAccess(tx, row.projectId, user)
      if (!mayCommand(user, command.kind, role)) throw new ForbiddenError('You cannot perform this grant action')
      const state = stateSchema.parse(row.state)
      if (commandPermission(command.kind) !== 'applicant') {
        if (role) throw new ForbiddenError('A project member cannot review their own grant')
        if (state.status === 'draft') throw new ForbiddenError('Draft applications are private to the project team')
      }
      if (!project || (project.archivedAt && role)) throw new ActionError('This project is archived or unavailable')
      if (row.revision !== revision) throw conflict()
      const continuous = row.roundId === null
      if (state.answers.intakeVersion === 2 && (command.kind === 'save_application' || command.kind === 'submit_application')) {
        if (!continuous && !shortIntakeEnabled()) throw new ActionError('Editing and submitting short drafts is currently unavailable. Your saved draft is unchanged.')
        if (command.kind === 'submit_application' && !command.shortAnswers)
          throw new ActionError('Review the short application and include the reviewed answers before submitting.')
      }

      const now = new Date()
      let previousScope: Awaited<ReturnType<typeof priorScope>> | undefined
      let projectVersionId = row.projectVersionId
      const reviewRequired = command.kind === 'submit_application' && state.version === 4
      const reviewed = reviewRequired ? command.reviewedProject : undefined
      const pinReply = command.kind === 'answer_request' && state.version !== 4 && !(state.version === 3 && state.milestoneClearance)
      if (command.kind === 'submit_application' || pinReply) {
        if (command.kind === 'submit_application') {
          if (row.round && !row.round.published) throw new ActionError(roundClosedForSubmission)
          if (continuous && !(await grantFlagOn(tx, 'miniGrantsIntake'))) throw new ActionError(continuousIntakePaused)
          if (continuous && state.status === 'draft') {
            const history = await grantIntakeHistory(tx, row.projectId, row.id)
            if (history.award || history.active.length) throw new ActionError(existingGrant)
            await checkReapplication(tx, history, now)
            if (history.latest) previousScope = await priorScope(tx, row.projectId, history.latest)
          }
        }
        if (reviewRequired && !reviewed) throw new ActionError(projectReviewChanged)
        projectVersionId = await pinVersion(tx, row.projectId, project.currentVersionId ?? '', continuous, reviewed)
      }
      if (command.kind === 'submit_application') {
        if (state.version === 4) {
          if (command.planAnswers) await resolveMilestone(tx, row.projectId, command.planAnswers, true)
        } else {
          if (command.shortAnswers && state.answers.intakeVersion !== 2) throw new ActionError('Continue using the original form for this draft.')
          if (state.version === 3) throw new ActionError('This application was already submitted')
          state.answers = await resolveMilestone(tx, row.projectId, command.shortAnswers ?? state.answers, true)
        }
      }
      const effectiveCommand = command.kind === 'save_application'
        ? { ...command, answers: await resolveMilestone(tx, row.projectId, command.answers, false) }
        : command
      const committeeReviewEnabled = state.version === 4 && await grantFlagOn(tx, 'grantsCommitteeReview')
      const committeeRequired = state.version === 4 && (committeeReviewEnabled || !!state.committeeReview)
      const approvalSchema = committeeRequired ? committeeAwardAuthorizationSchema : awardAuthorizationSchema
      const approval = command.kind === 'issue_award' && state.version === 4
        ? approvalSchema.safeParse(authorization).data : undefined
      const awardAuthorization = approval?.applicationId === row.id && approval.revision === row.revision &&
        approval.planId === state.applications.at(-1)?.id && approval.actorId === user.id ? approval : undefined
      const shortlist = state.version === 4 ? state.committeeReview?.shortlist : undefined
      const roster = committeeRequired
        ? await readCommitteeRoster(tx, shortlist ? !!shortlist.managedRoster : await grantFlagOn(tx, 'grantsCommitteeInvitations'), shortlist)
        : null
      const eventId = randomUUID()
      const next = transition(state, effectiveCommand, {
        id: eventId, actorId: user.id, now: now.toISOString(), projectVersionId, milestoneFirst: milestoneFirstEnabled(), awardAuthorization,
        committeeReviewEnabled, committeeRoster: roster,
      })
      if (roster && (command.kind === 'shortlist_application' || command.kind === 'vote_award' || command.kind === 'issue_award'))
        await checkCommitteeAccess(tx, roster, user.id, command.kind === 'shortlist_application' ? undefined : row.projectId)
      if (previousScope && !hasChangedRoadmapScope(previousScope.milestones, next.answers) &&
        !hasChangedDemo(previousScope.demoLinks, await demoLinksForVersion(tx, row.projectId, projectVersionId)))
        throw new ActionError(missingScopeChange)
      // Actor identities supplied as references must be real grant staff, not arbitrary strings.
      const assignee = 'ownerId' in command ? command.ownerId : null
      if (assignee) await assertReviewer(tx, assignee, user)
      if (command.kind === 'report_payment')
        await tx.grantPaymentReference.create({ data: { reference: command.reference, applicationId } })
      const result = await tx.grantApplication.updateMany({
        where: { id: applicationId, revision },
        data: { state: json(next), status: next.status, projectVersionId, revision: { increment: 1 } },
      })
      if (result.count !== 1) throw conflict()
      // Reapplication reads this immutable decision kind and its resulting status.
      const standardDecisionReceipt = command.kind === 'hold_application' || command.kind === 'decline_application'
      const receiptKind = standardDecisionReceipt ? 'record_decision' : command.kind
      await tx.grantRevision.create({
        data: { applicationId, number: revision + 1, actorId: user.id, kind: receiptKind, state: json(next) },
      })
      const event = continuous && command.kind === 'submit_application' ? 'submitted' : next.version !== 4 ? undefined
        : command.kind === 'review_delivery' ? command.outcome === 'accepted' ? 'grant_milestone_verified' : 'grant_evidence_returned'
          : planActivity[command.kind]
      if (event) {
        await recordProjectActivity(tx, [{
          projectId: row.projectId, versionId: projectVersionId, program: 'grants',
          targetId: applicationId, targetName: 'Mini Grants', event, actorId: user.id,
        }])
      }
      if (usesTransactionalGrantAudit(command.kind)) await writeAudit(tx, {
        actorId: user.id, action: `grant.${command.kind}`, entityType: 'GrantApplication', entityId: applicationId,
        before: { revision },
        after: {
          revision: revision + 1,
          ...(standardDecisionReceipt ? { outcome: next.status } : {}),
          ...(command.kind === 'shortlist_application' ? { planId: command.planId } : {}),
          ...(command.kind === 'request_award_amount' ? { requestId: eventId, planId: command.planId } : {}),
          ...(command.kind === 'respond_award_amount' ? { requestId: command.requestId, outcome: command.outcome } : {}),
          ...(command.kind === 'vote_award' ? { requestId: command.requestId, vote: command.vote } : {}),
          ...(command.kind === 'issue_award' ? {
            decisionId: eventId, planId: awardAuthorization?.planId,
            ...(next.version === 4 && next.committeeReview?.issuedRequestId ? { requestId: next.committeeReview.issuedRequestId } : {}),
          } : {}),
        },
      })
      return { id: applicationId, revision: revision + 1 }
    })
  } catch (error) {
    if (isWriteConflict(error)) throw conflict()
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ActionError('This project application or external payment reference is already recorded')
    throw error
  }
}
