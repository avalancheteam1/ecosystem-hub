import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/session'
import { userSearchWhere } from '@/lib/user-search'
import { assignAll, entryTracks } from './judging'
import { TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { submissionTeamWhere } from '@/lib/submission-team'
import { PROJECT_MEMBER_ORDER } from '@/lib/project-team'
import { isEligibleForPrize } from './feedback-rules'
import { canManageHackathon, needsOrganizerTerms } from './rules'

/** Full hackathon for the organiser console, or null if the user may not manage it. */
export const getManagedHackathon = cache(async (id: string, user: CurrentUser) => {
  const h = await prisma.hackathon.findUnique({
    where: { id },
    include: {
      event: true,
      organizers: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      judges: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      tracks: { orderBy: { order: 'asc' } },
      sponsorPrizes: { orderBy: { order: 'asc' } },
      prizes: { orderBy: [{ trackId: 'asc' }, { placement: 'asc' }], include: { awards: { orderBy: { placement: 'asc' } } } },
      stages: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } }, _count: { select: { entries: true } } } },
      fields: { where: { stageId: null }, orderBy: { order: 'asc' } },
      _count: { select: { participants: { where: { status: 'active' } }, submissions: { where: { status: 'active' } }, draftProjects: { where: { project: { archivedAt: null, submissions: { none: { hackathonId: id, entries: { some: {} } } } } } } } },
    },
  })
  if (!h || !canManageHackathon(user, h.organizers)) return null
  // Organiser data (registrations, emails, CSV) only after the data terms.
  if (needsOrganizerTerms(user, h.organizers)) redirect(`/manage/terms/${h.id}`)
  return h
})

/** Submitted reviews per stage (a hackathon has a handful of stages - one count each). */
export async function stageReviewCounts(stageIds: string[]) {
  const counts = await Promise.all(stageIds.map((stageId) => prisma.review.count({ where: { submittedAt: { not: null }, assignment: { entry: { stageId } } } })))
  return new Map(stageIds.map((sid, i) => [sid, counts[i]!]))
}

export type ManagedHackathon = NonNullable<Awaited<ReturnType<typeof getManagedHackathon>>>

export const REGISTRATION_SORTS = ['name', 'email', 'createdAt'] as const

/** One page of a hackathon's registrations in one status (organiser view), plus counts per status. */
export async function listRegistrations(hackathonId: string, opts: { status: string; q?: string; sort: { key: (typeof REGISTRATION_SORTS)[number]; dir: 'asc' | 'desc' }; page: number; pageSize: number }) {
  const { status, q, sort, page, pageSize } = opts
  const orderBy: Prisma.ParticipantOrderByWithRelationInput = sort.key === 'createdAt' ? { createdAt: sort.dir } : { user: { [sort.key]: sort.dir } }
  const [rows, counts] = await Promise.all([
    prisma.participant.findMany({
      where: { hackathonId, status, user: userSearchWhere(q) },
      orderBy: [orderBy, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.participant.groupBy({ by: ['status'], where: { hackathonId }, _count: true }),
  ])
  return {
    rows: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>,
  }
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
      sponsorPrizes: { orderBy: { order: 'asc' } },
      prizes: { orderBy: [{ placement: 'asc' }, { order: 'asc' }], include: { awards: { where: { prize: { publishedAt: { not: null } }, submission: { status: 'active', entries: { some: {} } } }, orderBy: { placement: 'asc' }, include: { submission: { include: { entries: { orderBy: { stage: { order: 'desc' } }, take: 1, include: { projectVersion: { select: { name: true, shortDescription: true, logoUrl: true, coverUrl: true } } } } } } } } } },
      stages: { orderBy: { order: 'asc' }, include: { criteria: { orderBy: { order: 'asc' }, select: { id: true, name: true, weight: true, description: true } } } },
      fields: { where: { stageId: null }, orderBy: { order: 'asc' } },
      _count: { select: { participants: { where: { status: 'active' } }, submissions: { where: { status: 'active' } } } },
    },
  })
  if (!h || h.status !== 'published') return null
  const participant = userId ? await prisma.participant.findUnique({ where: { hackathonId_userId: { hackathonId: h.id, userId } } }) : null
  // registration: null | active | pending | rejected | withdrawn
  return { ...h, prizes: h.prizes.map((p) => ({ ...p, awards: p.awards.filter((a) => isEligibleForPrize(a.submission, p)) })), joined: participant?.status === 'active', registration: participant?.status ?? null }
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
 * rows are created on read (idempotent) by every judging read below - judges and
 * organisers see them live, no button, no job. Existing rows (declared conflicts
 * included) are skipped by the unique key.
 */
async function ensureAllJudgesAssigned(where: Prisma.HackathonStageWhereInput) {
  const stages = await prisma.hackathonStage.findMany({
    where: { ...where, reviewMode: 'all', judgingClosedAt: null, closesAt: { lte: new Date() } },
    select: {
      sameTrackOnly: true,
      hackathon: { select: { judges: { select: { id: true, userId: true, trackIds: true } } } },
      entries: { where: { submission: { status: 'active' } }, select: { id: true, teamSnapshot: true, submission: { select: { trackIds: true, project: { select: { members: { select: { userId: true } } } } } } } },
    },
  })
  const data = stages.flatMap((s) => {
    const entries = s.entries.map((e) => ({ id: e.id, trackIds: entryTracks(e.submission.trackIds, s.sameTrackOnly), teamUserIds: [...(e.teamSnapshot as { userId: string }[]).map((m) => m.userId), ...e.submission.project.members.map((m) => m.userId)] }))
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
      submission: { select: { id: true, status: true, trackIds: true, sponsorPrizeIds: true, project: { select: { members: { select: { userId: true } } } } } },
      assignments: { include: { judge: { select: { email: true, user: { select: { name: true } } } }, review: { select: { total: true, scores: true, submittedAt: true, conflictDeclared: true } } } },
    },
  })
}

/** Active submissions with their latest entry - track prizes may go to teams that didn't reach the last stage. */
export async function listAwardableSubmissions(hackathonId: string) {
  return prisma.submission.findMany({
    where: { hackathonId, status: 'active' },
    select: { id: true, trackIds: true, sponsorPrizeIds: true, entries: { orderBy: { stage: { order: 'desc' } }, take: 1, select: { stage: { select: { name: true } }, projectVersion: { select: { name: true } } } } },
  })
}

/** `q` matches the project name or a team member's name/email. */
export async function listSubmissions(hackathonId: string, q?: string) {
  const matchingUsers = q ? await prisma.user.findMany({ where: { AND: [userSearchWhere(q), { participations: { some: { hackathonId } } }] }, select: { id: true } }) : []
  return prisma.submission.findMany({
    where: { hackathonId, ...(q && { OR: [{ project: { currentVersion: { name: { contains: q, mode: 'insensitive' } } } }, { project: { members: { some: { user: userSearchWhere(q) } } } }, submissionTeamWhere(matchingUsers.map((u) => u.id), TEAM_ROLES)] }) },
    orderBy: { createdAt: 'asc' },
    include: {
      project: { include: { currentVersion: { select: { name: true, shortDescription: true } }, members: { include: { user: { select: { name: true, email: true } } } } } },
      entries: { orderBy: { submittedAt: 'asc' }, select: { stageId: true, advancedAt: true, teamSnapshot: true, projectVersion: { select: { name: true, number: true, maturity: true } } } },
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
  const judge = await prisma.hackathonJudge.findFirst({ where: { hackathonId, userId }, include: { hackathon: { include: { event: { select: { name: true } }, tracks: { select: { id: true, name: true } }, sponsorPrizes: { select: { id: true, name: true } } } } } })
  if (!judge) return null
  await ensureAllJudgesAssigned({ hackathonId })
  const assignments = await prisma.judgeAssignment.findMany({
    where: { judgeId: judge.id, entry: { submission: { status: 'active' } } },
    include: { review: true, entry: { include: { submission: { select: { trackIds: true, sponsorPrizeIds: true } }, stage: true, projectVersion: { select: { name: true, shortDescription: true, number: true, logoUrl: true, coverUrl: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  return { judge, assignments }
}

/** Explicit event drafts only, including after the deadline. Caller must use getManagedHackathon first. */
export async function listUnsubmittedProjects(hackathonId: string) {
  return prisma.hackathonProject.findMany({
    where: { hackathonId, project: { archivedAt: null, submissions: { none: { hackathonId, entries: { some: {} } } } } },
    orderBy: { createdAt: 'asc' },
    select: { projectId: true, createdAt: true, project: { select: { currentVersion: { select: { name: true, shortDescription: true, logoUrl: true, coverUrl: true } }, members: { where: { role: { in: TEAM_ROLES } }, orderBy: PROJECT_MEMBER_ORDER, select: { user: { select: { name: true } } } } } } },
  })
}

/** Caller must authorize this event with getManagedHackathon before reading the draft. */
export async function getManagedDraft(hackathonId: string, projectId: string) {
  return prisma.hackathonProject.findFirst({
    where: { hackathonId, projectId, project: { archivedAt: null, submissions: { none: { hackathonId, entries: { some: {} } } } } },
    select: { project: { select: { currentVersion: true, members: { where: { role: { in: TEAM_ROLES } }, orderBy: PROJECT_MEMBER_ORDER, select: { user: { select: { name: true } } } } } } },
  })
}

/** Count only winners that the public query can reveal, for organizer reminders. */
export async function countPublishedWinners(hackathonId: string) {
  const awards = await prisma.award.findMany({
    where: { prize: { hackathonId, publishedAt: { not: null } }, submission: { status: 'active', entries: { some: {} } } },
    select: { prize: { select: { trackId: true, sponsorPrizeId: true } }, submission: { select: { trackIds: true, sponsorPrizeIds: true } } },
  })
  return awards.filter((a) => isEligibleForPrize(a.submission, a.prize)).length
}

/** Submission-only team details, kept out of the general project listing query. */
export async function getSubmissionTeams(hackathonId: string, projectIds: string[]) {
  return prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: {
      id: true,
      members: { where: { role: { in: TEAM_ROLES } }, orderBy: PROJECT_MEMBER_ORDER, select: { userId: true, role: true, user: { select: { name: true, _count: { select: { participations: { where: { hackathonId, status: 'active' } } } } } } } },
      _count: { select: { invites: { where: { role: { in: TEAM_ROLES }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } } } },
    },
  })
}

/** Caller must authorize the hackathon before reading submission details and correction history. */
export async function getManagedSubmission(hackathonId: string, submissionId: string) {
  return prisma.submission.findFirst({
    where: { id: submissionId, hackathonId },
    include: { entries: { include: {
      projectVersion: true,
      teamChanges: { orderBy: { createdAt: 'desc' } },
      assignments: { include: { judge: { select: { email: true, user: { select: { name: true } } } }, review: true } },
    } } },
  })
}


/** Active/pending registrants absent from every active submitted team snapshot. Authorize with getManagedHackathon first. */
export async function listUnsubmittedRegistrations(hackathonId: string) {
  const entries = await prisma.stageEntry.findMany({
    where: { stage: { hackathonId }, submission: { status: 'active' } },
    select: { teamSnapshot: true },
  })
  const submittedIds = [...new Set(entries.flatMap((e) => (e.teamSnapshot as { userId: string }[]).map((m) => m.userId)))]
  return prisma.participant.findMany({
    where: { hackathonId, status: { in: ['active', 'pending'] }, userId: { notIn: submittedIds } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { status: true, user: { select: { name: true, email: true } } },
  })
}

/** Resolve submitted snapshot identities only after the caller authorizes the event. */
export async function listSubmissionTeamUsers(userIds: string[]) {
  return prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
}
