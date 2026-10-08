import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { EventStatusBadge } from '@/app/(site)/events/_lib/status'
import { listPortalEvents, type PortalEvent } from '@/app/(site)/events/_lib/portal'
import { EventCover } from '@/components/event-cover'
import { PageHeader } from '@/components/layout/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { ImportEventDialog } from './_components/import-dialog'

export const metadata: Metadata = { title: 'Events' }

export default async function AdminEventsPage() {
  await requirePermission('hackathons.manage')
  const [events, portal] = await Promise.all([
    prisma.event.findMany({ orderBy: { startAt: 'desc' }, take: 200 }),
    listPortalEvents()
      .then((r) => ({ data: r.data, error: null as string | null }))
      .catch((err: Error) => ({ data: [] as PortalEvent[], error: err.message })),
  ])
  return (
    <>
      <PageHeader title="Events" description="Imported from Luma. Publish an event to show it on the hub.">
        <ImportEventDialog portalEvents={portal.data} portalError={portal.error} importedIds={events.map((e) => e.lumaEventId)} />
      </PageHeader>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Where</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <Link href={`/admin/events/${e.id}`} className="flex items-center gap-3 hover:text-fg-heading">
                    <EventCover src={e.coverUrl} className="size-10 shrink-0 rounded-lg" />
                    <span className="max-w-xs truncate text-fg-heading">{e.name}</span>
                    {e.syncError && <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Last Luma refresh failed" />}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatShortDate(e.startAt, e.timezone)}</TableCell>
                <TableCell>{e.isOnline ? 'Online' : (e.city ?? '—')}</TableCell>
                <TableCell><EventStatusBadge status={e.status} /></TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-fg-muted">No events yet. Add one from Luma to get started.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
