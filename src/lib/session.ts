import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isListedEmail, isSuperAdminUser, parseEmailList } from '@/lib/access'
import { effectivePermissions, type AuthzUser } from '@/lib/permissions'
import { hasSecondFactor, secondFactorPending, superAdminActive, type FactorState } from '@/lib/second-factor'

export type CurrentUser = AuthzUser & {
  id: string
  name: string
  email: string
  image: string | null
  /** A passkey or authenticator app is set up (this session proved it - otherwise there's no CurrentUser). */
  hasSecondFactor: boolean
  /** Super admin by flag/env, but powers are off until a second factor is set up and proven (src/lib/second-factor.ts). */
  superAdminNeedsSecondFactor: boolean
}

/** Signed out, signed in, or signed in but still owing the second factor ("pending"). */
export type AuthState = { status: 'signed-out' } | { status: 'pending'; userId: string; factors: FactorState } | { status: 'signed-in'; user: CurrentUser }

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
 * A session that still owes its second factor counts as signed out (fail closed).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const state = await getAuthState()
  return state.status === 'signed-in' ? state.user : null
})

export const getAuthState = cache(async (): Promise<AuthState> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { status: 'signed-out' }
  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      emailVerified: true,
      isSuperAdmin: true,
      twoFactorEnabled: true,
      _count: { select: { passkeys: true } },
      roles: { select: { role: { select: { permissions: true } } } },
      permissions: { select: { permission: true } },
    },
  })
  if (!row) return { status: 'signed-out' }
  const factors = { twoFactorEnabled: row.twoFactorEnabled, passkeys: row._count.passkeys }
  const verifiedAt = session.session.secondFactorAt ?? null
  if (secondFactorPending(factors, verifiedAt)) return { status: 'pending', userId: row.id, factors }
  const superAdmin = isSuperAdminUser(row, process.env.SUPER_ADMIN_EMAILS)
  // `next dev` only: super admin without a factor, for local testing. Positive match on purpose -
  // `next build` / `next start` (Railway) force 'production', vitest uses 'test'.
  const isSuperAdmin = superAdminActive(superAdmin, factors, verifiedAt) || (superAdmin && process.env.NODE_ENV === 'development')
  return {
    status: 'signed-in',
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      isSuperAdmin,
      hasSecondFactor: hasSecondFactor(factors),
      superAdminNeedsSecondFactor: superAdmin && !isSuperAdmin,
      permissions: effectivePermissions(
        row.roles.map((r) => r.role.permissions),
        row.permissions.map((p) => p.permission),
      ),
    },
  }
})
