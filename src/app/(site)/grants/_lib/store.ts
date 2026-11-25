import 'server-only'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import type { CurrentUser } from '@/lib/session'
import { canEditProject, missingForSubmission, planSeal } from '@/lib/project-submission'
import { roundClosedForSubmission, roundNotAccepting, stateSchema, type IntakeAnswers, type Command } from './schemas'
import { milestoneFirstEnabled, shortIntakeEnabled } from './config'
import { assertReviewer } from './staff'
import { commandPermission, initialState, mayCommand, transition } from './rules'

export const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
const conflict = () => new ActionError('This record changed. Refresh and review the latest version before saving.')
const transaction = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

async function projectAccess(tx: Prisma.TransactionClient, projectId: string, user: CurrentUser) {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { archivedAt: true, currentVersionId: true, members: { where: { userId: user.id }, select: { role: true } } },
  })
  return { project, role: project?.members[0]?.role ?? null }
}

async function pinVersion(tx: Prisma.TransactionClient, projectId: string, versionId: string) {
  const version = await tx.projectVersion.findUnique({ where: { id: versionId } })
  if (!version || version.projectId !== projectId) throw new ActionError('Save a project version first')
  const missing = missingForSubmission(version)
  if (missing.length) throw new ActionError(`Complete your project first: ${missing.join(', ')}`)
  if (planSeal(version) === 'seal-draft')
    await tx.projectVersion.updateMany({
      where: { id: version.id, sealedAt: null },
      data: { sealedAt: new Date(), note: 'Sealed for a team1 grant application' },
    })
  return version.id
}

// The live roadmap supplies the selection. The submitted terms retain the title
// and date even when the project team later edits or removes its roadmap entry.
async function resolveMilestone(tx: Prisma.TransactionClient, projectId: string, answers: IntakeAnswers, required: boolean): Promise<IntakeAnswers> {
  if (answers.intakeVersion === 2) {
    const milestone = answers.milestone
    if (milestone?.source === 'roadmap') {
      const live = await tx.projectMilestone.findFirst({
        where: { id: milestone.id, projectId, status: { in: ['planned', 'in_progress'] } },
        select: { title: true, targetDate: true },
      })
      if (!live || live.targetDate < new Date().toISOString().slice(0, 10) ||
        live.title !== milestone.title || live.targetDate !== milestone.due) {
        throw new ActionError('The roadmap milestone changed or is no longer eligible. Refresh the roadmap and review the updated commitment before continuing.')
      }
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

export async function createGrant(projectId: string, roundId: string, answers: IntakeAnswers, user: CurrentUser, submit = false) {
  if (answers.intakeVersion === 2 && !shortIntakeEnabled())
    throw new ActionError('The short form is currently unavailable. Reload to start a new application.')
  return transaction(async (tx) => {
    const { project, role } = await projectAccess(tx, projectId, user)
    if (!canEditProject(role ?? '')) throw new ForbiddenError('Only this project owner or a writer may apply')
    if (!project?.currentVersionId || project.archivedAt) throw new ActionError('Choose an active project with a saved version')
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
    const application = await tx.grantApplication.create({
      data: { roundId, projectId, projectVersionId: versionId, status: state.status, state: json(state) },
      select: { id: true },
    })
    await tx.grantRevision.create({
      data: { applicationId: application.id, number: 0, actorId: user.id, kind: 'create', state: json(state) },
    })
    return application
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw conflict()
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ActionError('This project already has an application in this round. Open My applications to continue it.')
    throw error
  })
}

export async function mutateGrant(applicationId: string, revision: number, command: Command, user: CurrentUser) {
  try {
    return await transaction(async (tx) => {
      const row = await tx.grantApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, projectId: true, projectVersionId: true, revision: true, state: true, round: { select: { published: true } } },
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
      if (state.answers.intakeVersion === 2 && (command.kind === 'save_application' || command.kind === 'submit_application')) {
        if (!shortIntakeEnabled()) throw new ActionError('Editing and submitting short drafts is currently unavailable. Your saved draft is unchanged.')
        if (command.kind === 'submit_application' && !command.shortAnswers)
          throw new ActionError('Review the short application and include the reviewed answers before submitting.')
      }

      let projectVersionId = row.projectVersionId
      const pinReply = command.kind === 'answer_request' && !(state.version === 3 && state.milestoneClearance)
      if (command.kind === 'submit_application' || pinReply) {
        if (command.kind === 'submit_application' && !row.round.published) throw new ActionError(roundClosedForSubmission)
        projectVersionId = await pinVersion(tx, row.projectId, project.currentVersionId ?? '')
      }
      if (command.kind === 'submit_application') {
        if (command.shortAnswers && state.answers.intakeVersion !== 2) throw new ActionError('Continue using the original form for this draft.')
        if (state.version === 3) throw new ActionError('This application was already submitted')
        state.answers = await resolveMilestone(tx, row.projectId, command.shortAnswers ?? state.answers, true)
      }
      const effectiveCommand = command.kind === 'save_application'
        ? { ...command, answers: await resolveMilestone(tx, row.projectId, command.answers, false) }
        : command
      const now = new Date().toISOString()
      const next = transition(state, effectiveCommand, { id: randomUUID(), actorId: user.id, now, projectVersionId, milestoneFirst: milestoneFirstEnabled() })
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
      await tx.grantRevision.create({
        data: { applicationId, number: revision + 1, actorId: user.id, kind: command.kind, state: json(next) },
      })
      return { id: applicationId, revision: revision + 1 }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw conflict()
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new ActionError('This project application or external payment reference is already recorded')
    throw error
  }
}
