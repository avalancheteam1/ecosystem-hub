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
