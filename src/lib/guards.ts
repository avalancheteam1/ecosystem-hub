import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { can, type Permission } from '@/lib/permissions'
import { getAuthState, type CurrentUser } from '@/lib/session'

// Guards for pages and layouts. Unauthenticated → /sign-in; signed in but the second factor
// not proven yet → /sign-in/verify; authenticated but lacking the power → 404 (don't reveal
// admin surfaces). For server actions use `action()` from src/lib/action.ts instead.

export const SECURITY_SETUP_PATH = '/profile/security?for=admin'

export async function requireUser(): Promise<CurrentUser> {
  const state = await getAuthState()
  if (state.status !== 'signed-in') {
    const path = (await headers()).get('x-pathname') ?? '/dashboard'
    redirect(`${state.status === 'pending' ? '/sign-in/verify' : '/sign-in'}?next=${encodeURIComponent(path)}`)
  }
  return state.user
}

/** Lacking the power → 404, except a super admin without a second factor: send them to set one up. */
export function denyAccess(user: CurrentUser): never {
  if (user.superAdminNeedsSecondFactor) redirect(SECURITY_SETUP_PATH)
  notFound()
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user, permission)) denyAccess(user)
  return user
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.isSuperAdmin) denyAccess(user)
  return user
}
