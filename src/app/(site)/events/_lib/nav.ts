import { CalendarDays } from 'lucide-react'
import type { AdminNavItem } from '@/app/admin/_lib/nav'
import { canManageEvents } from './access'

export const eventsAdminNav: AdminNavItem[] = [
  { href: '/admin/events', label: 'Events', icon: CalendarDays, show: canManageEvents },
]
