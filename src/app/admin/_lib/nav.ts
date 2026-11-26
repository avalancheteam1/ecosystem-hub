import type { LucideIcon } from 'lucide-react'
import { Activity, KeyRound, LayoutDashboard, ScrollText, ShieldCheck, ToggleRight, Users } from 'lucide-react'
import { referralsAdminNav } from '@/app/(app)/referrals/_lib/nav'
import { campusAdminNav } from '@/app/(app)/campus/_lib/nav'
import { eventsAdminNav } from '@/app/(site)/events/_lib/nav'
import { grantsAdminNav } from '@/app/(site)/grants/_lib/nav'
import { toolingAdminNav } from '@/app/(site)/tooling/_lib/nav'
import { can, type AuthzUser } from '@/lib/permissions'

// Admin sidebar registry. Each entry's `show` must mirror the guard of its page.
// Areas export their entries and add them to a group below with one line: `...hackathonAdminNav`.

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; show: (u: AuthzUser) => boolean }
/** `label` = heading above the group (the first group, Overview, has none). */
export type AdminNavGroup = { label?: string; items: AdminNavItem[] }

const superAdmin = (u: AuthzUser) => u.isSuperAdmin

export const ADMIN_NAV: AdminNavGroup[] = [
  { items: [{ href: '/admin', label: 'Overview', icon: LayoutDashboard, show: () => true }] },
  { label: 'Programs', items: [...eventsAdminNav, ...grantsAdminNav, ...referralsAdminNav, ...toolingAdminNav] },
  { label: 'Campus', items: [...campusAdminNav] },
  { label: 'People', items: [{ href: '/admin/users', label: 'Users', icon: Users, show: (u) => can(u, 'users.view') }] },
  {
    label: 'System',
    items: [
      { href: '/admin/access', label: 'Access', icon: ShieldCheck, show: superAdmin },
      { href: '/admin/flags', label: 'Feature flags', icon: ToggleRight, show: superAdmin },
      { href: '/admin/audit', label: 'Audit log', icon: ScrollText, show: superAdmin },
      { href: '/admin/jobs', label: 'Jobs', icon: Activity, show: superAdmin },
      { href: '/admin/api-keys', label: 'API keys', icon: KeyRound, show: superAdmin },
    ],
  },
]

/** The groups `user` sees, empty groups dropped. */
export function visibleAdminNav(user: AuthzUser): AdminNavGroup[] {
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.show(user)) })).filter((g) => g.items.length > 0)
}
