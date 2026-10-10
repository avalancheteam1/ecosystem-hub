import Link from 'next/link'
import { Gavel, Pencil, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CurrentUser } from '@/lib/session'
import { canManageEvents } from '../_lib/access'
import { getEventHackathonRoles } from '../_lib/hackathons/queries'
import { canManageHackathon } from '../_lib/hackathons/rules'

/** Shortcuts for viewers who can edit the event, run its hackathon or judge it. Links only - each target page guards itself. */
export async function EventManageLinks({ eventId, user }: { eventId: string; user: CurrentUser | null }) {
  if (!user) return null
  const h = await getEventHackathonRoles(eventId, user.id)
  const links = [
    canManageEvents(user) && { href: `/admin/events/${eventId}`, label: 'Edit event', icon: Pencil },
    h && canManageHackathon(user, h.organizers) && { href: `/manage/hackathons/${h.id}`, label: 'Manage hackathon', icon: Settings },
    h && h.judges.length > 0 && { href: `/judge/${h.id}`, label: 'Judge', icon: Gavel },
  ].filter((l) => !!l)
  if (links.length === 0) return null
  return (
    <div className="container-page flex flex-wrap justify-end gap-2 pt-6">
      {links.map(({ href, label, icon: Icon }) => (
        <Button key={href} asChild variant="outline">
          <Link href={href}><Icon aria-hidden /> {label}</Link>
        </Button>
      ))}
    </div>
  )
}
