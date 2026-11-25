import { HandCoins } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { can } from '@/lib/permissions'

export const grantsAdminNav: AdminNavItem[] = [
  { href: '/admin/grants', label: 'Grants', icon: HandCoins, show: (user) => can(user, 'grants.review') },
]
