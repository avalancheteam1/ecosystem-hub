// Permission registry + checks. PURE and isomorphic (no DB, no server imports):
// used by server guards, server actions and client components alike.
//
// Keys are persisted (Role.permissions, UserPermission.permission) - only ever
// ADD keys, never rename or remove them without a data migration.
//
// Adding an area's permissions: create `app/(site)/<area>/_lib/permissions.ts`
//   export const hackathonPermissions = {
//     'hackathons.manage': { group: 'hackathons', label: 'Create and edit hackathons' },
//   } as const satisfies Record<string, PermissionDef>
// and spread it into PERMISSIONS below (one line).

export type PermissionDef = {
  /** UI grouping in /admin/access. */
  group: string
  label: string
  /** Shown as a warning when granting (e.g. "sees participants' emails"). */
  sensitive?: string
  /** Keys that only make sense together with this one (UI hint, not enforced). */
  requires?: readonly string[]
}

import { eventPermissions } from '@/app/(site)/events/_lib/permissions'
import { referralPermissions } from '@/app/(app)/referrals/_lib/permissions'

const corePermissions = {
  'users.view': { group: 'users', label: 'View the user list', sensitive: "Sees every user's email address" },
} as const satisfies Record<string, PermissionDef>

export const PERMISSIONS = {
  ...corePermissions,
  ...eventPermissions,
  ...referralPermissions,
} as const satisfies Record<string, PermissionDef>

export type Permission = keyof typeof PERMISSIONS

/** What permission checks need from a user. `permissions` is already effective (roles ∪ grants). */
export type AuthzUser = {
  isSuperAdmin: boolean
  permissions: ReadonlySet<Permission>
}

export function isPermission(key: string): key is Permission {
  return Object.hasOwn(PERMISSIONS, key)
}

/** Merge role permission lists and direct grants; unknown (stale) keys are dropped. */
export function effectivePermissions(rolePermissions: readonly (readonly string[])[], direct: readonly string[]): Set<Permission> {
  const out = new Set<Permission>()
  for (const key of [...rolePermissions.flat(), ...direct]) {
    if (isPermission(key)) out.add(key)
  }
  return out
}

export function can(user: AuthzUser | null | undefined, permission: Permission): boolean {
  if (!user) return false
  return user.isSuperAdmin || user.permissions.has(permission)
}

/** Gate for the /admin area: super admin or any permission at all. */
export function holdsAny(user: AuthzUser | null | undefined): boolean {
  if (!user) return false
  return user.isSuperAdmin || user.permissions.size > 0
}

export const PERMISSION_GROUPS: { group: string; keys: Permission[] }[] = Object.entries(
  Object.groupBy(Object.keys(PERMISSIONS) as Permission[], (k) => PERMISSIONS[k].group),
).map(([group, keys]) => ({ group, keys: keys ?? [] }))
