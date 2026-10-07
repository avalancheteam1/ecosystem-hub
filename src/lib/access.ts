import { z } from 'zod'
import { ActionError } from '@/lib/action-error'
import { isPermission } from '@/lib/permissions'

// Pure rules for /admin/access (roles, grants, super admins).

/** Prevents a super admin from locking themselves out. */
export function assertMaySetSuperAdmin(actorId: string, targetId: string, value: boolean): void {
  if (actorId === targetId && !value) throw new ActionError('You cannot remove your own super admin access')
}

export const roleSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,40}$/, 'Slug: 2–41 chars, lowercase letters, digits and dashes')

export const permissionListSchema = z
  .array(z.string())
  .refine((keys) => keys.every(isPermission), 'Unknown permission')
  .transform((keys) => [...new Set(keys)])

/**
 * Super admin = DB flag, or an email in SUPER_ADMIN_EMAILS (comma-separated,
 * bootstrap / break-glass) — the env list only counts for a VERIFIED email.
 */
export function isSuperAdminUser(
  u: { isSuperAdmin: boolean; email: string; emailVerified: boolean },
  envList: string | undefined,
): boolean {
  return u.isSuperAdmin || (u.emailVerified && isListedEmail(u.email, envList))
}

/** Parse a comma-separated email list (lowercased). */
export function parseEmailList(envList: string | undefined): string[] {
  return (envList ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
}

export function isListedEmail(email: string, envList: string | undefined): boolean {
  return parseEmailList(envList).includes(email.trim().toLowerCase())
}
