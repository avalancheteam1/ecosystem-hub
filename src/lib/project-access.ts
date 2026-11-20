import 'server-only'
import { ForbiddenError } from '@/lib/action'
import { prisma } from '@/lib/db'
import { canManageTeam } from '@/lib/project-team'

export async function requireProjectOwner(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!m) throw new ForbiddenError('You are not on this project')
  if (!canManageTeam(m.role)) throw new ForbiddenError('Only the owner can manage the team')
  return m
}
