import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isListedEmail, isSuperAdminUser, parseEmailList } from '@/lib/access'
import { effectivePermissions, type AuthzUser } from '@/lib/permissions'

export type CurrentUser = AuthzUser & {
  id: string
  name: string
  email: string
  image: string | null
}

/** Emails listed in SUPER_ADMIN_EMAILS (lowercased). */
export function envSuperAdminEmails(): string[] {
  return parseEmailList(process.env.SUPER_ADMIN_EMAILS)
}

/** Listed in SUPER_ADMIN_EMAILS (counts as super admin only once the email is verified). */
export function isEnvSuperAdmin(email: string): boolean {
  return isListedEmail(email, process.env.SUPER_ADMIN_EMAILS)
}

/**
 * The signed-in user with effective permissions, once per request.
 * Roles and grants are read live from the DB every request (never from the
 * session cookie) so a revoke takes effect immediately.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      emailVerified: true,
      isSuperAdmin: true,
      roles: { select: { role: { select: { permissions: true } } } },
      permissions: { select: { permission: true } },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    isSuperAdmin: isSuperAdminUser(row, process.env.SUPER_ADMIN_EMAILS),
    permissions: effectivePermissions(
      row.roles.map((r) => r.role.permissions),
      row.permissions.map((p) => p.permission),
    ),
  }
})
