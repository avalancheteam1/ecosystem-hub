import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ExternalLink, MapPin } from 'lucide-react'
import { EventStatusBadge } from '@/app/(site)/events/_lib/status'
import { EventCover } from '@/components/event-cover'
import { Markdown } from '@/components/markdown'
import { formatEventRange, formatUtc } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { canManageEvents } from '@/app/(site)/events/_lib/access'
import { requireUser } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { EventActions } from '../_components/event-actions'
import { HackathonButton } from '../_components/hackathon-button'

export const metadata: Metadata = { title: 'Event' }

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!canManageEvents(user)) notFound()
  const event = await prisma.event.findUnique({ where: { id: (await params).id }, include: { hackathon: { select: { id: true } } } })
  if (!event) notFound()
  return (
    <>
      <BackLink href="/admin/events">Events
      </BackLink>
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <EventCover src={event.coverUrl} className="max-w-[280px]" />
        <div className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <EventStatusBadge status={event.status} />
              {event.lumaVisibility !== 'public' && <span className="text-sm text-fg-muted">Not public on Luma</span>}
              {event.source === 'portal' && <span className="text-sm text-fg-muted">Synced from the member portal</span>}
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl">{event.name}</h1>
            <p className="mt-2 text-fg-body">{formatEventRange(event.startAt, event.endAt, event.timezone)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-fg-muted">
              <MapPin className="size-4" aria-hidden /> {event.isOnline ? 'Online' : (event.fullAddress ?? event.city ?? 'Location on Luma')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user, 'hackathons.manage') && <HackathonButton eventId={event.id} hackathonId={event.hackathon?.id ?? null} eventStart={event.startAt} eventEnd={event.endAt} eventTimezone={event.timezone} />}
            <EventActions id={event.id} status={event.status} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={event.lumaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg-heading">
              Open on Luma <ExternalLink className="size-3.5" aria-hidden />
            </a>
            {event.status === 'published' && (
              <Link href={`/events/${event.slug}`} className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg-heading">
                View on the Ecosystem Hub <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            )}
            <span className="text-fg-faint">Last synced {formatUtc(event.lastSyncedAt)}</span>
          </div>
          {event.syncError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-fg-body">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> Last refresh failed: {event.syncError}
            </p>
          )}
          {event.descriptionMd && (
            <section className="rounded-xl border border-line bg-surface-2 p-6">
              <h2 className="mb-4 text-lg">Description from {event.source === 'portal' ? 'the member portal' : 'Luma'}</h2>
              <Markdown>{event.descriptionMd}</Markdown>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
