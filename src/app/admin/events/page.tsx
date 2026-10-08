import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { EventStatusBadge } from '@/app/(site)/events/_lib/status'
import { listPortalEvents, type PortalEvent } from '@/app/(site)/events/_lib/portal'
import { DataTable } from '@/components/data-table'
import { EventCover } from '@/components/event-cover'
import { PageHeader } from '@/components/layout/page-header'
import { formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { canManageEvents } from '@/app/(site)/events/_lib/access'
import { requireUser } from '@/lib/guards'
import { getPortalProfile } from '@/lib/member-portal'
import { ImportEventDialog } from './_components/import-dialog'

export const metadata: Metadata = { title: 'Events' }

export default async function AdminEventsPage() {
  const user = await requireUser()
  if (!canManageEvents(user)) notFound()
  // team1 events (the portal tab) are for team1 members only — importEvent re-checks
  const isMember = !!(await getPortalProfile(user.id))?.tier
  const [events, portal] = await Promise.all([
    prisma.event.findMany({ orderBy: { startAt: 'desc' }, take: 200 }),
    isMember
      ? listPortalEvents()
          .then((r) => ({ data: r.data as PortalEvent[] | null, error: null as string | null }))
          .catch((err: Error) => ({ data: [] as PortalEvent[] | null, error: err.message }))
      : { data: null, error: null },
  ])
  return (
    <>
      <PageHeader title="Events" description="Imported from Luma or the member portal. Publish an event to show it on the Ecosystem Hub.">
        <ImportEventDialog portalEvents={portal.data} portalError={portal.error} importedIds={events.map((e) => e.lumaEventId)} />
      </PageHeader>
      <DataTable
        id="admin-events"
        empty="No events yet. Add one from Luma to get started."
        columns={[
          { key: 'name', label: 'Event', sortable: true, hideable: false },
          { key: 'startAt', label: 'Date', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'where', label: 'Where', sortable: true },
          { key: 'status', label: 'Status', sortable: true },
        ]}
        rows={events.map((e) => ({
          id: e.id,
          sort: { name: e.name, startAt: e.startAt.getTime(), status: e.status },
          cells: {
            name: (
              <Link href={`/admin/events/${e.id}`} className="flex items-center gap-3 hover:text-fg-heading">
                <EventCover src={e.coverUrl} className="size-10 shrink-0 rounded-lg" />
                <span className="max-w-xs truncate text-fg-heading">{e.name}</span>
                {e.syncError && <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Last Luma refresh failed" />}
              </Link>
            ),
            startAt: formatShortDate(e.startAt, e.timezone),
            where: e.isOnline ? 'Online' : (e.city ?? ''),
            status: <EventStatusBadge status={e.status} />,
          },
        }))}
      />
    </>
  )
}
