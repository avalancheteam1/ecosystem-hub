import type { LucideIcon } from 'lucide-react'
import { Activity, KeyRound, LayoutDashboard, ScrollText, ShieldCheck, Users } from 'lucide-react'
import { referralsAdminNav } from '@/app/(app)/referrals/_lib/nav'
import { eventsAdminNav } from '@/app/(site)/events/_lib/nav'
import { can } from '@/lib/permissions'
import type { CurrentUser } from '@/lib/session'

// Admin sidebar registry. Each entry's `show` must mirror the guard of its page.
// Areas append their entries with one line: `...hackathonAdminNav`.

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; show: (u: CurrentUser) => boolean }

const superAdmin = (u: CurrentUser) => u.isSuperAdmin

export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, show: () => true },
  ...eventsAdminNav,
  ...referralsAdminNav,
  { href: '/admin/users', label: 'Users', icon: Users, show: (u) => can(u, 'users.view') },
  { href: '/admin/access', label: 'Access', icon: ShieldCheck, show: superAdmin },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText, show: superAdmin },
  { href: '/admin/jobs', label: 'Jobs', icon: Activity, show: superAdmin },
  { href: '/admin/api-keys', label: 'API keys', icon: KeyRound, show: superAdmin },
]
