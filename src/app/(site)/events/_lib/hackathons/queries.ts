import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/session'
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

export type ManagedHackathon = NonNullable<Awaited<ReturnType<typeof getManagedHackathon>>>

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

/** Public hackathon for an event page (published only), plus the viewer's participation. */
export const getPublicHackathon = cache(async (eventId: string, userId: string | null) => {
  const h = await prisma.hackathon.findUnique({
    where: { eventId },
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
  return { ...h, joined: participant?.status === 'active' }
})

export type PublicHackathon = NonNullable<Awaited<ReturnType<typeof getPublicHackathon>>>

/** The viewer's team submission in this hackathon (via project membership), with entries and pinned versions. */
export async function getMySubmission(hackathonId: string, userId: string) {
  return prisma.submission.findFirst({
    where: { hackathonId, status: { not: 'withdrawn' }, project: { members: { some: { userId } } } },
    include: {
      project: { include: { currentVersion: { select: { id: true, number: true, name: true } } } },
      entries: { include: { projectVersion: { select: { number: true } } } },
    },
  })
}

/** Organiser judging data for one stage: entries, assignment progress and (after close) the ranking inputs. */
export async function getStageJudging(stageId: string) {
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
      entries: { select: { stageId: true, advancedAt: true, projectVersion: { select: { number: true } } } },
    },
  })
}

/** Hackathons the user judges, with their assignment progress. */
export async function listJudgeHackathons(userId: string) {
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
  const assignments = await prisma.judgeAssignment.findMany({
    where: { judgeId: judge.id, entry: { submission: { status: 'active' } } },
    include: { review: true, entry: { include: { stage: true, projectVersion: { select: { name: true, shortDescription: true, number: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  return { judge, assignments }
}
