import { UsersRound } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { can, type AuthzUser } from '@/lib/permissions'

/** Guard of /admin/groups (list + detail) - the nav entry mirrors it. */
export const canSeeGroupsAdmin = (u: AuthzUser) => can(u, 'groups.manage') || can(u, 'referrals.view')

export const referralsAdminNav: AdminNavItem[] = [
  { href: '/admin/groups', label: 'Groups', icon: UsersRound, show: canSeeGroupsAdmin },
]
