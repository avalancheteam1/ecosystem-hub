import 'server-only'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import type { CurrentUser } from '@/lib/session'
import { canEditProject, missingForSubmission, planSeal } from '@/lib/project-submission'
import { stateSchema, type Answers, type Command } from './schemas'
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

export async function createGrant(projectId: string, roundId: string, answers: Answers, user: CurrentUser, submit = false) {
  return transaction(async (tx) => {
    const { project, role } = await projectAccess(tx, projectId, user)
    if (!canEditProject(role ?? '')) throw new ForbiddenError('Only this project owner or a writer may apply')
    if (!project?.currentVersionId || project.archivedAt) throw new ActionError('Choose an active project with a saved version')
    const round = await tx.grantRound.findFirst({ where: { id: roundId, published: true }, select: { id: true } })
    if (!round) throw new ActionError('This round is not accepting applications')
    const initial = initialState(answers)
    const versionId = submit ? await pinVersion(tx, projectId, project.currentVersionId) : project.currentVersionId
    const state = submit
      ? transition(
          initial,
          { kind: 'submit_application', confirm: true },
          { id: randomUUID(), actorId: user.id, now: new Date().toISOString(), projectVersionId: versionId },
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
      let projectVersionId = row.projectVersionId
      if (command.kind === 'submit_application' || command.kind === 'answer_request') {
        if (command.kind === 'submit_application' && !row.round.published) throw new ActionError('This round is closed')
        projectVersionId = await pinVersion(tx, row.projectId, project.currentVersionId ?? '')
      }
      const now = new Date().toISOString()
      const next = transition(state, command, { id: randomUUID(), actorId: user.id, now, projectVersionId })
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
