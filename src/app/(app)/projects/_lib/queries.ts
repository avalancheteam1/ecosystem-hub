import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

export async function listMyProjects(userId: string) {
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId } } },
    orderBy: { updatedAt: 'desc' },
    include: { currentVersion: true, _count: { select: { members: true } } },
  })
}

/** Full project for its team; null for anyone else (projects aren't public yet). */
export const getProjectForMember = cache(async (slug: string, userId: string) => {
  const project = await prisma.project.findUnique({
    where: { slug },
    include: {
      currentVersion: true,
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: 'asc' } },
      invites: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } },
      versions: { orderBy: { number: 'desc' }, select: { id: true, number: true, note: true, sealedAt: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } } } },
    },
  })
  if (!project || project.archivedAt || !project.members.some((m) => m.userId === userId)) return null
  return project
})
