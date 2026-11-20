import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

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
      invites: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, role: true } },
      versions: {
        orderBy: { number: 'desc' },
        select: {
          id: true, number: true, note: true, sealedAt: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } },
          stageEntries: { orderBy: { submittedAt: 'asc' }, select: { id: true, stage: { select: { name: true, hackathon: { select: { event: { select: { name: true, slug: true } } } } } } } },
        },
      },
    },
  })
  if (!project || project.archivedAt || !project.members.some((m) => m.userId === userId)) return null
  return project
})

/** Open project invites to my (verified) email - accepted in-app via acceptInviteById. */
export async function listMyInvites(userId: string) {
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  if (!me?.emailVerified) return []
  return prisma.projectInvite.findMany({
    where: { email: me.email.toLowerCase(), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, project: { archivedAt: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, role: true, project: { select: { currentVersion: { select: { name: true } } } } },
  })
}

/** Team-only context for explicit event drafts and actual submissions, never inferred from unrelated personal projects. */
export async function getProjectHackathonContext(projectId: string, userId: string) {
  const membership = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!membership) return []
  const emails = membership.role === 'owner' ? (await prisma.projectInvite.findMany({ where: { projectId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { email: true } })).map((i) => i.email) : []
  return prisma.hackathon.findMany({
    where: { OR: [{ draftProjects: { some: { projectId } } }, { submissions: { some: { projectId } } }] },
    select: {
      stages: { orderBy: { order: 'asc' }, select: { id: true, name: true, opensAt: true, closesAt: true, judgingClosedAt: true } },
      id: true, timezone: true, optionalProjectFields: true, event: { select: { name: true, slug: true } },
      participants: { where: { user: { OR: [{ projectMembers: { some: { projectId } } }, { email: { in: emails } }] } }, select: { userId: true, status: true, user: { select: { email: true } } } },
      submissions: { where: { projectId }, select: { status: true, entries: { orderBy: { submittedAt: 'desc' }, select: { submittedAt: true, projectVersionId: true } } } },
    },
  })
}

/** Public requirement configuration for a project editor returning to an event. */
export async function projectRequirementsForReturn(next: string | null) {
  const slug = next?.match(/^\/events\/([^/?]+)\/submit(?:[?]|$)/)?.[1]
  if (!slug) return ['videoUrl']
  const h = await prisma.hackathon.findFirst({ where: { status: 'published', event: { slug, status: { in: ['published', 'unlisted'] } } }, select: { optionalProjectFields: true } })
  return h?.optionalProjectFields ?? ['videoUrl']
}

export async function listProjectHackathonTargets(userId: string) {
  return prisma.hackathon.findMany({
    where: { status: 'published', event: { status: { in: ['published', 'unlisted'] } }, participants: { some: { userId, status: 'active' } }, stages: { some: { opensAt: { lte: new Date() }, closesAt: { gt: new Date() }, judgingClosedAt: null } } },
    select: { id: true, event: { select: { name: true, slug: true } } },
  })
}
