import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { teamActivityView } from '@/lib/project-activity'
import { activityHref } from './rules'

/** `roles` narrows to projects where I hold one of them, and counts only members holding them. */
export async function listMyProjects(userId: string, roles?: string[]) {
  const role = roles ? { role: { in: roles } } : {}
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId, ...role } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      currentVersion: true,
      milestones: { where: { status: { in: ['planned', 'in_progress'] } }, orderBy: { targetDate: 'asc' }, take: 1, select: { title: true, targetDate: true } },
      _count: { select: { members: { where: role } } },
    },
  })
}

/** Full project for its team; null for anyone else (projects aren't public yet). */
export const getProjectForMember = cache(async (slug: string, userId: string) => {
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      currentVersion: true,
      milestones: { orderBy: [{ targetDate: 'asc' }, { createdAt: 'asc' }] },
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: 'asc' } },
      invites: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true, inviteeUser: { select: { name: true } } } },
      toolingListing: { select: { approvedVersionId: true, pendingVersionId: true } },
      versions: {
        orderBy: { number: 'desc' },
        select: {
          id: true, number: true, note: true, sealedAt: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } },
          stageEntries: { select: { id: true } },
        },
      },
    },
  })
  if (!project || project.archivedAt || !project.members.some((m) => m.userId === userId)) return null
  return project
})

/**
 * The version history for the project page, already as the team may see it: internal reasons and the ids of reviewers and
 * organisers never leave this function (`teamActivityView`), so passing the result anywhere can't leak them. Call only
 * after `getProjectForMember` confirmed the viewer is on the team.
 */
export async function listProjectActivityForTeam(project: { id: string; slug: string; members: { userId: string; user: { name: string } }[]; toolingListing: { approvedVersionId: string | null } | null }) {
  const rows = await prisma.projectActivity.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, versionId: true, program: true, targetId: true, targetName: true, event: true, reason: true, reasonInternal: true, actorId: true, createdAt: true },
  })
  // A hackathon links to its event page; the slug can change, so it is read now.
  const hackathonIds = [...new Set(rows.flatMap((a) => (a.program === 'hackathon' && a.targetId ? [a.targetId] : [])))]
  const hackathons = hackathonIds.length ? await prisma.hackathon.findMany({ where: { id: { in: hackathonIds } }, select: { id: true, event: { select: { slug: true } } } }) : []
  const links = { projectSlug: project.slug, listedToolingVersionId: project.toolingListing?.approvedVersionId ?? null, hackathonSlugs: new Map(hackathons.map((h) => [h.id, h.event.slug])) }
  const names = new Map(project.members.map((m) => [m.userId, m.user.name]))
  return rows.map((a) => {
    const view = teamActivityView(a, names)
    return { id: a.id, versionId: a.versionId, createdAt: a.createdAt, target: a.targetName ?? view.program, href: activityHref(a, links), event: view.event, by: view.by, reason: view.reason }
  })
}

/** Open project invites to my (verified) email or to my user id (find a team) - accepted in-app via acceptInviteById. */
export async function listMyInvites(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  return prisma.projectInvite.findMany({
    where: { OR: [{ inviteeUserId: userId }, ...(me?.emailVerified ? [{ email: me.email.toLowerCase() }] : [])], acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, project: { archivedAt: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, role: true, project: { select: { currentVersion: { select: { name: true } } } } },
  })
}
