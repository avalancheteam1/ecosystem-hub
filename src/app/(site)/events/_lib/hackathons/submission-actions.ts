'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { hackathonTargetName, recordProjectActivity } from '@/lib/project-activity'
import { buildAnswersSchema, stageState } from './rules'
import { canSubmitToStage } from './submissions'
import { canEditProject, missingForSubmission, planSeal, TEAM_ROLES } from '@/lib/project-submission'
import { submissionNote } from '@/app/(app)/projects/_lib/rules'

/** Submit (or update) a project to a stage: pins the project's CURRENT version and the team. */
export const submitToStage = action(
  {
    schema: z.object({
      hackathonId: z.string().min(1),
      stageId: z.string().min(1),
      projectId: z.string().min(1),
      trackIds: z.array(z.string()).max(20).transform((t) => [...new Set(t)]),
      answers: z.record(z.string(), z.unknown()),
      preexistingIdea: z.boolean(),
      builtDuringEvent: z.string().trim().max(5000).optional().transform((v) => v || null),
    }).refine((v) => !v.preexistingIdea || v.builtDuringEvent, { message: 'Explain what you built during the hackathon', path: ['builtDuringEvent'] }),
    permission: 'user',
  },
  async ({ hackathonId, stageId, projectId, trackIds, answers, preexistingIdea, builtDuringEvent }, user) => {
    const h = await prisma.hackathon.findUnique({
      where: { id: hackathonId },
      include: { event: { select: { slug: true, name: true } }, tracks: { select: { id: true } }, stages: { orderBy: { order: 'asc' }, include: { fields: true } } },
    })
    if (!h || h.status !== 'published') throw new ActionError('Hackathon not found')
    const idx = h.stages.findIndex((s) => s.id === stageId)
    const stage = h.stages[idx]
    if (!stage) throw new ActionError('Stage not found')

    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: true, members: { include: { user: { select: { id: true, name: true } } } } } })
    if (!project || project.archivedAt || !project.currentVersionId || !project.currentVersion) throw new ActionError('Project not found')
    const missing = missingForSubmission(project.currentVersion)
    if (missing.length) throw new ActionError(`Complete your project first - missing: ${missing.join(', ')}`)
    const teamMembers = project.members.filter((m) => canEditProject(m.role)) // readers aren't on the hackathon team
    const team = teamMembers.map((m) => m.userId)

    const [submission, participants, clash] = await Promise.all([
      prisma.submission.findUnique({ where: { hackathonId_projectId: { hackathonId, projectId } }, include: { entries: { select: { stageId: true, advancedAt: true } } } }),
      prisma.participant.findMany({ where: { hackathonId, status: 'active', userId: { in: team } }, select: { userId: true } }),
      h.allowMultipleSubmissions ? null : prisma.submission.findFirst({ where: { hackathonId, status: 'active', projectId: { not: projectId }, project: { members: { some: { userId: { in: team }, role: { in: TEAM_ROLES } } } } }, select: { id: true } }),
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
    if (h.tracks.length && !trackIds.length) throw new ActionError('Pick at least one track')
    if (trackIds.some((t) => !h.tracks.some((x) => x.id === t))) throw new ActionError('Unknown track')
    const parsed = buildAnswersSchema(stage.fields).safeParse(answers)
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? 'Check your answers')

    const teamSnapshot = teamMembers.map((m) => ({ userId: m.userId, name: m.user.name }))
    const entry = await prisma.$transaction(async (tx) => {
      // Unless multiple submissions are allowed, serialise per hackathon so "one active submission per person" holds under concurrency.
      if (!h.allowMultipleSubmissions) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hackathonId}))`
        const clashNow = await tx.submission.findFirst({ where: { hackathonId, status: 'active', projectId: { not: projectId }, project: { members: { some: { userId: { in: team }, role: { in: TEAM_ROLES } } } } }, select: { id: true } })
        if (clashNow) throw new ActionError('Someone on this team is already part of another submission in this hackathon')
      }
      // Seal the project's draft (or reuse the latest sealed version if nothing changed since).
      const current = await tx.projectVersion.findUniqueOrThrow({ where: { id: project.currentVersionId! } })
      if (planSeal(current) === 'seal-draft') {
        const stageLabel = h.stages.length > 1 ? ` - ${stage.name}` : ''
        await tx.projectVersion.update({ where: { id: current.id }, data: { sealedAt: new Date(), note: submissionNote(`${h.event.name}${stageLabel}`) } })
      }
      const sub = await tx.submission.upsert({
        where: { hackathonId_projectId: { hackathonId, projectId } },
        create: { hackathonId, projectId, trackIds, createdById: user.id },
        update: idx === 0 ? { trackIds } : {}, // tracks are chosen in the first stage (or a team's first submission)
      })
      const before = await tx.stageEntry.findUnique({ where: { submissionId_stageId: { submissionId: sub.id, stageId } }, select: { projectVersionId: true } })
      const saved = await tx.stageEntry.upsert({
        where: { submissionId_stageId: { submissionId: sub.id, stageId } },
        create: { submissionId: sub.id, stageId, projectVersionId: current.id, answers: parsed.data as object, teamSnapshot, preexistingIdea, builtDuringEvent },
        update: { projectVersionId: current.id, answers: parsed.data as object, teamSnapshot, preexistingIdea, builtDuringEvent, submittedAt: new Date() },
      })
      // A new version for this stage is an activity (and replaces the one before); updating answers on the same version isn't.
      if (before?.projectVersionId !== current.id) {
        const base = { projectId, program: 'hackathon' as const, targetId: hackathonId, targetName: hackathonTargetName(h.event.name, stage.name, h.stages.length), actorId: user.id }
        await recordProjectActivity(tx, [
          { ...base, versionId: current.id, event: 'submitted' },
          ...(before ? [{ ...base, versionId: before.projectVersionId, event: 'replaced' as const }] : []),
        ])
      }
      return saved
    })
    await recordAudit({ actorId: user.id, action: 'hackathon.entry.submit', entityType: 'StageEntry', entityId: entry.id, after: { stageId, projectVersionId: project.currentVersionId, trackIds } })
    revalidatePath(`/events/${h.event.slug}`, 'layout')
    return { slug: h.event.slug }
  },
)

export const withdrawSubmission = action({ schema: z.object({ submissionId: z.string().min(1) }), permission: 'user' }, async ({ submissionId }, user) => {
  const s = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      project: { include: { members: { select: { userId: true, role: true } } } },
      hackathon: { include: { event: { select: { slug: true, name: true } }, stages: { orderBy: { order: 'asc' } } } },
      entries: { orderBy: { stage: { order: 'desc' } }, take: 1, select: { projectVersionId: true, stage: { select: { name: true } } } },
    },
  })
  if (!s || !s.project.members.some((m) => m.userId === user.id)) throw new ActionError('Submission not found')
  if (!s.project.members.some((m) => m.userId === user.id && canEditProject(m.role))) throw new ForbiddenError('Only writers and the owner can withdraw')
  if (s.status !== 'active') throw new ActionError('This submission is not active')
  const last = s.hackathon.stages.at(-1)
  if (last && stageState(last, new Date()) === 'closed') throw new ActionError('The hackathon is over - submissions can no longer be withdrawn')
  const latest = s.entries[0]
  await prisma.$transaction(async (tx) => {
    const r = await tx.submission.updateMany({ where: { id: s.id, status: 'active' }, data: { status: 'withdrawn' } })
    if (!r.count) throw new ActionError('This submission is not active')
    if (latest) {
      await recordProjectActivity(tx, [{
        projectId: s.projectId, versionId: latest.projectVersionId, program: 'hackathon', targetId: s.hackathonId,
        targetName: hackathonTargetName(s.hackathon.event.name, latest.stage.name, s.hackathon.stages.length), event: 'withdrawn', actorId: user.id,
      }])
    }
  })
  await recordAudit({ actorId: user.id, action: 'hackathon.submission.withdraw', entityType: 'Submission', entityId: s.id })
  revalidatePath(`/events/${s.hackathon.event.slug}`, 'layout')
  return null
})
