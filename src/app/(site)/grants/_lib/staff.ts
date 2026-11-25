import 'server-only'
import type { Prisma } from '@prisma/client'
import type { CurrentUser } from '@/lib/session'
import { can } from '@/lib/permissions'
import { ActionError } from '@/lib/action-error'

/** References to an operational owner must identify an existing reviewer. */
export async function assertReviewer(tx: Prisma.TransactionClient, ownerId: string, actor: CurrentUser) {
  if (ownerId === actor.id && can(actor, 'grants.review')) return
  const owner = await tx.user.findUnique({
    where: { id: ownerId },
    select: {
      id: true,
      isSuperAdmin: true,
      permissions: { select: { permission: true } },
      roles: { select: { role: { select: { permissions: true } } } },
    },
  })
  const keys = [...(owner?.permissions.map((p) => p.permission) ?? []), ...(owner?.roles.flatMap((r) => r.role.permissions) ?? [])]
  if (!owner || !(owner.isSuperAdmin || keys.includes('grants.review'))) throw new ActionError('Choose an existing grant reviewer as owner')
}
