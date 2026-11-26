import 'server-only'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'
import type { CurrentUser } from '@/lib/session'

/** Staff names and IDs only, for existing-user assignment controls. Caller must hold grants.review. */
export async function reviewerOptions(user: CurrentUser) {
  if (!can(user, 'grants.review')) return []
  const rows = await prisma.user.findMany({
    where: {
      OR: [
        { id: user.id },
        { isSuperAdmin: true },
        { permissions: { some: { permission: 'grants.review' } } },
        { roles: { some: { role: { permissions: { has: 'grants.review' } } } } },
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 100,
  })
  return rows.map((row) => ({ value: row.id, label: row.name }))
}
