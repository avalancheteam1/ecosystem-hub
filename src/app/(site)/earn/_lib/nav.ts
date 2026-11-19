import { Trophy } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { can } from '@/lib/permissions'

export const earnAdminNav: AdminNavItem[] = [
  { href: '/admin/earn', label: 'Earn', icon: Trophy, show: (user) => can(user, 'earn.publish') },
]
