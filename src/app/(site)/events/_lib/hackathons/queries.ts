import 'server-only'
import { cache } from 'react'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/session'
import { assignAll } from './judging'
import { TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { canManageHackathon } from './rules'

/** Full hackathon for the organiser console, or null if the user may not manage it. */
export const getManagedHackathon = cache(async (id: string, user: CurrentUser) => {
  const h = await prisma.hackathon.findUnique({
    where: { id },
    include: {
      event: true,
      organizers: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      judges: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      tracks: { orderBy: { order: 'asc' } },
      prizes: { orderBy: [{ trackId: 'asc' }, { placement: 'asc' }], include: { award: true } },
      stages: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } }, _count: { select: { entries: true } } } },
      fields: { where: { stageId: null }, orderBy: { order: 'asc' } },
      _count: { select: { participants: { where: { status: 'active' } }, submissions: { where: { status: 'active' } } } },
    },
  })
  if (!h || !canManageHackathon(user, h.organizers)) return null
  return h
})

/** Submitted reviews per stage (a hackathon has a handful of stages — one count each). */
export async function stageReviewCounts(stageIds: string[]) {
  const counts = await Promise.all(stageIds.map((stageId) => prisma.review.count({ where: { submittedAt: { not: null }, assignment: { entry: { stageId } } } })))
  return new Map(stageIds.map((sid, i) => [sid, counts[i]!]))
}

export type ManagedHackathon = NonNullable<Awaited<ReturnType<typeof getManagedHackathon>>>

/** Registrations awaiting a decision (pending) and rejected ones (approvable as an undo). */
export async function listRegistrationRequests(hackathonId: string) {
  return prisma.participant.findMany({
    where: { hackathonId, status: { in: ['pending', 'rejected'] } },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    include: { user: { select: { name: true, email: true } } },
  })
}

/** Hackathons this user organises (or all, for hackathons.manage holders). */
export async function listManagedHackathons(user: CurrentUser, all: boolean) {
  return prisma.hackathon.findMany({
    where: all ? {} : { organizers: { some: { userId: user.id } } },
    include: { event: { select: { name: true, startAt: true, timezone: true, coverUrl: true } } },
    orderBy: { event: { startAt: 'desc' } },
  })
}

/** For the header menu: does this user judge or organise anything? */
export const getHackathonRoles = cache(async (userId: string) => {
  const [judge, organizer] = await Promise.all([
    prisma.hackathonJudge.count({ where: { userId } }),
    prisma.hackathonOrganizer.count({ where: { userId } }),
  ])
  return { judge: judge > 0, organizer: organizer > 0 }
})

/** Event-page links for the viewer: is there a hackathon, and do they organise or judge it? */
export async function getEventHackathonRoles(eventId: string, userId: string) {
  return prisma.hackathon.findUnique({
    where: { eventId },
    select: { id: true, organizers: { where: { userId }, select: { userId: true } }, judges: { where: { userId }, select: { id: true } } },
  })
}

/** Public hackathon for an event page (published only), plus the viewer's participation. */
export const getPublicHackathon = cache(async (eventId: string, userId: string | null) => {
  const h = await prisma.hackathon.findUnique({
    where: { eventId },
    omit: { inviteToken: true },
    include: {
      tracks: { orderBy: { order: 'asc' } },
      prizes: { orderBy: [{ placement: 'asc' }, { order: 'asc' }], include: { award: { include: { submission: { include: { entries: { orderBy: { stage: { order: 'desc' } }, take: 1, include: { projectVersion: { select: { name: true, shortDescription: true } } } } } } } } } },
      stages: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' }, select: { id: true, name: true, weight: true, description: true } } } },
      fields: { where: { stageId: null }, orderBy: { order: 'asc' } },
      _count: { select: { participants: { where: { status: 'active' } }, submissions: { where: { status: 'active' } } } },
    },
  })
  if (!h || h.status !== 'published') return null
  const participant = userId ? await prisma.participant.findUnique({ where: { hackathonId_userId: { hackathonId: h.id, userId } } }) : null
  // registration: null | active | pending | rejected | withdrawn
  return { ...h, joined: participant?.status === 'active', registration: participant?.status ?? null }
})

export type PublicHackathon = NonNullable<Awaited<ReturnType<typeof getPublicHackathon>>>

/** The viewer's team submissions in this hackathon (via project membership, readers excluded), with entries and pinned versions. */
export async function getMySubmissions(hackathonId: string, userId: string) {
  return prisma.submission.findMany({
    where: { hackathonId, status: { not: 'withdrawn' }, project: { members: { some: { userId, role: { in: TEAM_ROLES } } } } },
    orderBy: { createdAt: 'asc' },
    include: {
      project: { include: { currentVersion: { select: { id: true, number: true, name: true } } } },
      entries: { include: { projectVersion: { select: { number: true } } } },
    },
  })
}

/**
 * "All judges" stages need no draw: once submissions close, every eligible judge
 * reviews every active submission. Reviews hang on a JudgeAssignment row, so the
 * rows are created on read (idempotent) by every judging read below — judges and
 * organisers see them live, no button, no job. Existing rows (declared conflicts
 * included) are skipped by the unique key.
 */
async function ensureAllJudgesAssigned(where: Prisma.HackathonStageWhereInput) {
  const stages = await prisma.hackathonStage.findMany({
    where: { ...where, reviewMode: 'all', judgingClosedAt: null, closesAt: { lte: new Date() } },
    select: {
      hackathon: { select: { judges: { select: { id: true, userId: true, trackIds: true } } } },
      entries: { where: { submission: { status: 'active' } }, select: { id: true, teamSnapshot: true, submission: { select: { trackIds: true, project: { select: { members: { select: { userId: true } } } } } } } },
    },
  })
  const data = stages.flatMap((s) => {
    const entries = s.entries.map((e) => ({ id: e.id, trackIds: e.submission.trackIds, teamUserIds: [...(e.teamSnapshot as { userId: string }[]).map((m) => m.userId), ...e.submission.project.members.map((m) => m.userId)] }))
    return assignAll(entries, s.hackathon.judges).map(([judgeId, entryId]) => ({ judgeId, entryId }))
  })
  if (data.length) await prisma.judgeAssignment.createMany({ data, skipDuplicates: true })
}

/** Organiser judging data for one stage: entries, assignment progress and (after close) the ranking inputs. */
export async function getStageJudging(stageId: string) {
  await ensureAllJudgesAssigned({ id: stageId })
  return prisma.stageEntry.findMany({
    where: { stageId },
    orderBy: { submittedAt: 'asc' },
    include: {
      projectVersion: { select: { name: true, shortDescription: true, number: true } },
      submission: { select: { id: true, status: true, trackIds: true, project: { select: { members: { select: { userId: true } } } } } },
      assignments: { include: { judge: { select: { email: true, user: { select: { name: true } } } }, review: { select: { total: true, submittedAt: true, conflictDeclared: true } } } },
    },
  })
}

export async function listSubmissions(hackathonId: string) {
  return prisma.submission.findMany({
    where: { hackathonId },
    orderBy: { createdAt: 'asc' },
    include: {
      project: { include: { currentVersion: { select: { name: true, shortDescription: true } }, members: { include: { user: { select: { name: true, email: true } } } } } },
      entries: { orderBy: { submittedAt: 'asc' }, select: { stageId: true, advancedAt: true, projectVersion: { select: { number: true, maturity: true } } } },
    },
  })
}

/** Hackathons the user judges, with their assignment progress. */
export async function listJudgeHackathons(userId: string) {
  await ensureAllJudgesAssigned({ hackathon: { judges: { some: { userId } } } })
  return prisma.hackathonJudge.findMany({
    where: { userId },
    include: {
      hackathon: { include: { event: { select: { name: true, coverUrl: true, startAt: true, timezone: true } } } },
      assignments: { where: { entry: { submission: { status: 'active' } } }, select: { review: { select: { submittedAt: true } }, entry: { select: { stage: { select: { judgingClosedAt: true } } } } } },
    },
  })
}

/** A judge's queue in one hackathon. */
export async function getJudgeQueue(hackathonId: string, userId: string) {
  const judge = await prisma.hackathonJudge.findFirst({ where: { hackathonId, userId }, include: { hackathon: { include: { event: { select: { name: true } } } } } })
  if (!judge) return null
  await ensureAllJudgesAssigned({ hackathonId })
  const assignments = await prisma.judgeAssignment.findMany({
    where: { judgeId: judge.id, entry: { submission: { status: 'active' } } },
    include: { review: true, entry: { include: { stage: true, projectVersion: { select: { name: true, shortDescription: true, number: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  return { judge, assignments }
}
