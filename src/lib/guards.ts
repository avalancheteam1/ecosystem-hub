import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getRequestIp } from '@/lib/request-ip'
import { securityEvent } from '@/lib/security-events'
import { rejectedTarget, rejectsNext } from '@/lib/safe-next'
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
export function denyAccess(user: CurrentUser, req?: { path: string | null; ip: string | null }): never {
  if (user.superAdminNeedsSecondFactor) redirect(SECURITY_SETUP_PATH)
  securityEvent('page.denied', { userId: user.id, ip: req?.ip ?? undefined, detail: { path: req?.path?.split('?')[0] ?? null } })
  notFound()
}

/** Request context for `denyAccess` (path + ip). */
export async function denyContext() {
  const h = await headers()
  return { path: h.get('x-pathname'), ip: getRequestIp(h) }
}

/** Records a refused post-sign-in redirect target (`safeNext` itself stays pure). */
export async function reportRejectedNext(raw: string | null | undefined) {
  if (!rejectsNext(raw)) return
  securityEvent('redirect.rejected', { ip: getRequestIp(await headers()) ?? undefined, detail: { target: rejectedTarget(raw!) } })
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user, permission)) denyAccess(user, await denyContext())
  return user
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.isSuperAdmin) denyAccess(user, await denyContext())
  return user
}
