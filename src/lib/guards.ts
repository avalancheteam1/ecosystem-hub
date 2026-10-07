import 'server-only'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { can, type Permission } from '@/lib/permissions'
import { getCurrentUser, type CurrentUser } from '@/lib/session'

// Guards for pages and layouts. Unauthenticated → /sign-in; authenticated but
// lacking the power → 404 (don't reveal admin surfaces). For server actions use
// `action()` from src/lib/action.ts instead.

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) {
    const path = (await headers()).get('x-pathname') ?? '/dashboard'
    redirect(`/sign-in?next=${encodeURIComponent(path)}`)
  }
  return user
}

export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser()
  if (!can(user, permission)) notFound()
  return user
}

export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser()
  if (!user.isSuperAdmin) notFound()
  return user
}
