import { CalendarDays } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { can } from '@/lib/permissions'

export const eventsAdminNav: AdminNavItem[] = [
  { href: '/admin/events', label: 'Events', icon: CalendarDays, show: (u) => can(u, 'hackathons.manage') },
]
