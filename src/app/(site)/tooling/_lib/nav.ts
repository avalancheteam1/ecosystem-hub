import { Wrench } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { can } from '@/lib/permissions'

export const toolingAdminNav: AdminNavItem[] = [
  { href: '/admin/tooling', label: 'Tooling', icon: Wrench, show: (u) => can(u, 'tooling.review') },
]
