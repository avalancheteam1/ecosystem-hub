import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { EventStatusBadge } from '@/app/(site)/events/_lib/status'
import { listPortalEvents, type PortalEvent } from '@/app/(site)/events/_lib/portal'
import { DataTable } from '@/components/data-table'
import { EventCover } from '@/components/event-cover'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { canManageEvents } from '@/app/(site)/events/_lib/access'
import { requireUser } from '@/lib/guards'
import { getPortalProfile } from '@/lib/member-portal'
import { pageParam, sortParams, textParam } from '@/lib/params'
import { ImportEventDialog } from './_components/import-dialog'

export const metadata: Metadata = { title: 'Events' }

const PAGE_SIZE = 50
const SORTS = ['name', 'startAt', 'city', 'status'] as const

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; sort?: string | string[]; dir?: string | string[] }> }) {
  const user = await requireUser()
  if (!canManageEvents(user)) notFound()
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const sort = sortParams(sp, SORTS, { key: 'startAt', dir: 'desc' })
  // team1 events (the portal tab) are for team1 members only — importEvent re-checks
  const isMember = !!(await getPortalProfile(user.id))?.tier
  const [rows, imported, portal] = await Promise.all([
    prisma.event.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : undefined,
      orderBy: [{ [sort.key]: sort.dir }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    // the import dialog marks every already-imported event, not just this page's
    prisma.event.findMany({ select: { lumaEventId: true } }),
    isMember
      ? listPortalEvents()
          .then((r) => ({ data: r.data as PortalEvent[] | null, error: null as string | null }))
          .catch((err: Error) => ({ data: [] as PortalEvent[] | null, error: err.message }))
      : { data: null, error: null },
  ])
  const events = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Events" description="Public member-portal events are added and published automatically (hourly). Unpublish one to hide it; add other events from Luma and publish them.">
        <ImportEventDialog portalEvents={portal.data} portalError={portal.error} importedIds={imported.map((e) => e.lumaEventId)} />
      </PageHeader>
      <SearchForm q={q} placeholder="Search name or city" />
      <DataTable
        id="admin-events"
        sort={sort}
        empty={q ? 'No events found.' : 'No events yet. Add one from Luma to get started.'}
        columns={[
          { key: 'name', label: 'Event', sortable: true, hideable: false },
          { key: 'startAt', label: 'Date', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'city', label: 'Where', sortable: true },
          { key: 'status', label: 'Status', sortable: true },
        ]}
        rows={events.map((e) => ({
          id: e.id,
          cells: {
            name: (
              <Link href={`/admin/events/${e.id}`} className="flex items-center gap-3 hover:text-fg-heading">
                <EventCover src={e.coverUrl} className="size-10 shrink-0 rounded-lg" />
                <span className="max-w-xs truncate text-fg-heading">{e.name}</span>
                {e.syncError && <AlertTriangle className="size-4 shrink-0 text-warning" aria-label="Last Luma refresh failed" />}
              </Link>
            ),
            startAt: formatShortDate(e.startAt, e.timezone),
            city: e.isOnline ? 'Online' : (e.city ?? ''),
            status: <EventStatusBadge status={e.status} />,
          },
        }))}
      />
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ q, sort: sort.key, dir: sort.dir }} />
    </>
  )
}
