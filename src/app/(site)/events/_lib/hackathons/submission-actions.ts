'use server'

import { submissionTeamWhere } from '@/lib/submission-team'
import { PROJECT_MEMBER_ORDER } from '@/lib/project-team'
import { matchesSubmissionConfirmation } from '@/lib/submission-status'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { buildAnswersSchema, stageState } from './rules'
import { selectionProblem } from './feedback-rules'
import { builtWorkSchema } from './schemas'
import { canSubmitToStage } from './submissions'
import { canEditProject, missingForSubmission, planSeal, submissionNote, TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'

/** Submit (or update) a project to a stage: pins the project's CURRENT version and the team. */
export const submitToStage = action(
  {
    schema: z.object({
      hackathonId: z.string().min(1),
      stageId: z.string().min(1),
      projectId: z.string().min(1),
      confirmation: z.object({ versionId: z.string().min(1), updatedAt: z.iso.datetime(), teamUserIds: z.array(z.string().min(1)) }),
      trackIds: z.array(z.string().min(1)).transform((t) => [...new Set(t)]),
      sponsorPrizeIds: z.array(z.string().min(1)).default([]).transform((t) => [...new Set(t)]),
      answers: z.record(z.string(), z.unknown()),
    }).and(builtWorkSchema),
    permission: 'user',
  },
  async ({ hackathonId, stageId, projectId, confirmation, trackIds, sponsorPrizeIds, answers, preexistingIdea, builtDuringEvent }, user) => {
    const h = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      include: { event: { select: { slug: true, name: true } }, tracks: { select: { id: true } }, sponsorPrizes: { select: { id: true } }, stages: { orderBy: { order: 'asc' }, include: { fields: true } } },
    })
    if (!h || h.status !== 'published') throw new ActionError('Hackathon not found')
    const idx = h.stages.findIndex((s) => s.id === stageId)
    const stage = h.stages[idx]
    if (!stage) throw new ActionError('Stage not found')

    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: true, members: { orderBy: PROJECT_MEMBER_ORDER, include: { user: { select: { id: true, name: true } } } } } })
    if (!project || project.archivedAt || !project.currentVersionId || !project.currentVersion) throw new ActionError('Project not found')
    if (!project.members.some((m) => m.userId === user.id && canEditProject(m.role))) throw new ForbiddenError('Only the project owner and writers can submit')
    const missing = missingForSubmission(project.currentVersion, h.optionalProjectFields)
    if (missing.length) throw new ActionError(`Complete your project first - missing: ${missing.join(', ')}`)
    const teamMembers = project.members.filter((m) => canEditProject(m.role)) // readers aren't on the hackathon team
    const team = teamMembers.map((m) => m.userId)
    if (!matchesSubmissionConfirmation(project.currentVersion, team, confirmation)) throw new ActionError('The project or team changed. Reload and confirm the current version before submitting.')

    const [submission, participants, clash] = await Promise.all([
      prisma.submission.findUnique({ where: { hackathonId_projectId: { hackathonId, projectId } }, include: { entries: { select: { stageId: true, advancedAt: true } } } }),
      prisma.participant.findMany({ where: { hackathonId, status: 'active', userId: { in: team } }, select: { userId: true } }),
      h.allowMultipleSubmissions ? null : prisma.submission.findFirst({ where: { hackathonId, status: 'active', projectId: { not: projectId }, ...submissionTeamWhere(team, TEAM_ROLES) }, select: { id: true } }),
    ])
    const prev = h.stages[idx - 1]
    const check = canSubmitToStage({
      stage,
      isFirstStage: idx === 0,
      advancedFromPrevious: !!prev && !!submission?.entries.find((e) => e.stageId === prev.id)?.advancedAt,
      submissionStatus: submission?.status ?? null,
      team,
      activeParticipants: new Set(participants.map((p) => p.userId)),
      teamSizeMin: h.teamSizeMin,
      teamSizeMax: h.teamSizeMax,
      submitterId: user.id,
      now: new Date(),
    })
    if (!check.ok) throw new ActionError(check.reason)
    if (clash) throw new ActionError('Someone on this team is already part of another submission in this hackathon')
    const selectionError = selectionProblem(trackIds, h.tracks.map((t) => t.id), 'track') ?? selectionProblem(sponsorPrizeIds, h.sponsorPrizes.map((p) => p.id), 'sponsor prize')
    if (selectionError) throw new ActionError(selectionError)
    const parsed = buildAnswersSchema(stage.fields).safeParse(answers)
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? 'Check your answers')

    const teamSnapshot = teamMembers.map((m) => ({ userId: m.userId, name: m.user.name }))
    const entry = await prisma.$transaction(async (tx) => {
      // Unless multiple submissions are allowed, serialise per hackathon so "one active submission per person" holds under concurrency.
      if (!h.allowMultipleSubmissions) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hackathonId}))`
        const clashNow = await tx.submission.findFirst({ where: { hackathonId, status: 'active', projectId: { not: projectId }, ...submissionTeamWhere(team, TEAM_ROLES) }, select: { id: true } })
        if (clashNow) throw new ActionError('Someone on this team is already part of another submission in this hackathon')
      }
      // Recheck the confirmed project and team after any lock wait. The parent
      // lock blocks new memberships; member locks block removals/role changes.
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM project_members WHERE "projectId" = ${projectId} FOR UPDATE`
      const freshProject = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true, currentVersionId: true, members: { select: { userId: true, role: true } } } })
      if (!freshProject || freshProject.archivedAt) throw new ActionError('Project not found')
      if (!freshProject.members.some((m) => m.userId === user.id && canEditProject(m.role))) throw new ForbiddenError('Only the project owner and writers can submit')
      const freshTeam = freshProject.members.filter((m) => canEditProject(m.role)).map((m) => m.userId)
      if (freshProject.currentVersionId !== confirmation.versionId) throw new ActionError('The project changed. Reload and confirm again before submitting.')
      // Seal the project's draft (or reuse the latest sealed version if nothing changed since).
      await tx.$queryRaw`SELECT id FROM project_versions WHERE id = ${confirmation.versionId} FOR UPDATE`
      const current = await tx.projectVersion.findUniqueOrThrow({ where: { id: project.currentVersionId! } })
      if (!matchesSubmissionConfirmation(current, freshTeam, confirmation)) throw new ActionError('The project or team changed. Reload and confirm again before submitting.')
      if (stageState(stage, new Date()) !== 'open') throw new ActionError('Submissions are closed')
      if (planSeal(current) === 'seal-draft') {
        const stageLabel = h.stages.length > 1 ? ` - ${stage.name}` : ''
        await tx.projectVersion.update({ where: { id: current.id }, data: { sealedAt: new Date(), note: submissionNote(`${h.event.name}${stageLabel}`) } })
      }
      const sub = await tx.submission.upsert({
        where: { hackathonId_projectId: { hackathonId, projectId } },
        create: { hackathonId, projectId, trackIds, sponsorPrizeIds, createdById: user.id },
        update: idx === 0 || !submission ? { trackIds, sponsorPrizeIds } : { sponsorPrizeIds }, // tracks are chosen in the first stage (or a team's first submission)
      })
      return tx.stageEntry.upsert({
        where: { submissionId_stageId: { submissionId: sub.id, stageId } },
        create: { submissionId: sub.id, stageId, projectVersionId: current.id, answers: parsed.data as object, teamSnapshot, preexistingIdea, builtDuringEvent },
        update: { projectVersionId: current.id, answers: parsed.data as object, teamSnapshot, preexistingIdea, builtDuringEvent, submittedAt: new Date() },
      })
    })
    await recordAudit({ actorId: user.id, action: 'hackathon.entry.submit', entityType: 'StageEntry', entityId: entry.id, after: { stageId, projectVersionId: project.currentVersionId, trackIds, sponsorPrizeIds } })
    revalidatePath(`/events/${h.event.slug}`, 'layout')
    revalidatePath('/projects', 'layout')
    revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
    return { slug: h.event.slug }
  },
)

export const withdrawSubmission = action({ schema: z.object({ submissionId: z.string().min(1) }), permission: 'user' }, async ({ submissionId }, user) => {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { project: { include: { members: { select: { userId: true, role: true } } } }, hackathon: { include: { event: { select: { slug: true } }, stages: { orderBy: { order: 'asc' } } } } },
  })
  if (!s || !s.project.members.some((m) => m.userId === user.id)) throw new ActionError('Submission not found')
  if (!s.project.members.some((m) => m.userId === user.id && canEditProject(m.role))) throw new ForbiddenError('Only writers and the owner can withdraw')
  if (s.status !== 'active') throw new ActionError('This submission is not active')
  const last = s.hackathon.stages.at(-1)
  if (last && stageState(last, new Date()) === 'closed') throw new ActionError('The hackathon is over - submissions can no longer be withdrawn')
  await prisma.submission.update({ where: { id: s.id }, data: { status: 'withdrawn' } })
  await recordAudit({ actorId: user.id, action: 'hackathon.submission.withdraw', entityType: 'Submission', entityId: s.id })
  revalidatePath(`/events/${s.hackathon.event.slug}`, 'layout')
  revalidatePath('/projects', 'layout')
  return null
})

/** Explicitly save for the organizer's draft list; no stage entry is created. */
export const saveHackathonDraft = action({ schema: z.object({ hackathonId: z.string().min(1), projectId: z.string().min(1) }), permission: 'user' }, async ({ hackathonId, projectId }, user) => {
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, include: { project: { select: { archivedAt: true } } } })
  if (!member || !canEditProject(member.role) || member.project.archivedAt) throw new ForbiddenError('Only the project owner and writers can save a hackathon draft')
  const participant = await prisma.participant.findUnique({ where: { hackathonId_userId: { hackathonId, userId: user.id } }, include: { hackathon: { select: { status: true, event: { select: { slug: true } } } } } })
  if (participant?.status !== 'active' || participant.hackathon.status !== 'published') throw new ActionError('Register for this hackathon first')
  await prisma.hackathonProject.upsert({ where: { hackathonId_projectId: { hackathonId, projectId } }, create: { hackathonId, projectId }, update: {} })
  await recordAudit({ actorId: user.id, action: 'hackathon.draft.save', entityType: 'Hackathon', entityId: hackathonId, after: { projectId } })
  revalidatePath(`/projects`, 'layout')
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  return null
})
