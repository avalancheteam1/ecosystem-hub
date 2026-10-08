import Link from 'next/link'
import type { Event } from '@prisma/client'
import { Trophy } from 'lucide-react'
import { EventCover } from '@/components/event-cover'
import { formatShortDate } from '@/lib/dates'

/** Image-led event tile: cover zooms on hover, mono metadata, no card chrome. */
export function EventCard({ event, hackathon }: { event: Event; hackathon?: boolean }) {
  const where = event.isOnline ? 'Online' : [event.city, event.country].filter(Boolean).join(', ') || 'Location on Luma'
  return (
    <Link href={`/events/${event.slug}`} className="group block">
      <div className="relative overflow-hidden rounded-xl border border-line transition-colors duration-200 group-hover:border-brand/60">
        <EventCover src={event.coverUrl} className="zoom-on-hover rounded-none border-0" />
        {hackathon && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-surface-0/85 px-2.5 py-1 text-xs text-fg-heading backdrop-blur">
            <Trophy className="size-3 text-brand" aria-hidden /> Hackathon
          </span>
        )}
      </div>
      <p className="meta mt-4">{formatShortDate(event.startAt, event.timezone)} — {where}</p>
      <h3 className="mt-1.5 line-clamp-2 text-lg leading-snug transition-colors group-hover:text-brand">{event.name}</h3>
    </Link>
  )
}
