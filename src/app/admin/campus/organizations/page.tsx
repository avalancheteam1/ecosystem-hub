import type { Prisma } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { StatusPill } from '@/components/status-pill'
import { CAMPUS_ORG_TYPES, normalizeOrgName } from '@/lib/campus'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'
import { FilterChip } from '@/components/filter-chip'

export const metadata: Metadata = { title: 'Universities & clubs' }

const PAGE_SIZE = 50
const VIEWS = { review: 'To review', university: 'Universities', blockchain_club: 'Clubs', hidden: 'Hidden' } as const
type View = keyof typeof VIEWS

export default async function CampusOrganizationsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; view?: string | string[] }> }) {
  await requirePermission('campus.manage')
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const v = textParam(sp.view)
  const view: View = v && v in VIEWS ? (v as View) : 'review'
  const where: Prisma.OrganizationWhereInput = {
    type: view === 'review' || view === 'hidden' ? { in: [...CAMPUS_ORG_TYPES] } : view,
    ...(view === 'review' ? { verified: false, hidden: false } : { hidden: view === 'hidden' }),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { normalizedAliases: { has: normalizeOrgName(q) } }] } : {}),
  }
  const rows = await prisma.organization.findMany({
    where,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { id: true, type: true, name: true, country: true, rorId: true, verified: true, createdAt: true, parent: { select: { name: true } }, _count: { select: { members: true, clubMembers: true } } },
  })
  const list = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Universities & clubs" description="Universities and clubs builders use. Universities come from the university list when picked; builders add missing ones and clubs - check those under To review." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchForm q={q} placeholder="Search by name" keep={{ view }} className="mb-0 flex-1 basis-56" />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(VIEWS) as View[]).map((k) => <FilterChip key={k} href={`/admin/campus/organizations?${new URLSearchParams({ view: k, ...(q ? { q } : {}) })}`} active={view === k}>{VIEWS[k]}</FilterChip>)}
        </div>
      </div>
      <DataTable
        id="admin-campus-orgs"
        empty="Nothing here."
        columns={[
          { key: 'name', label: 'Name', hideable: false },
          { key: 'type', label: 'Type' },
          { key: 'country', label: 'Country' },
          { key: 'source', label: 'Source' },
          { key: 'members', label: 'Members', className: 'text-right' },
          { key: 'added', label: 'Added', className: 'whitespace-nowrap' },
        ]}
        rows={list.map((o) => ({
          id: o.id,
          cells: {
            name: <Link href={`/admin/campus/organizations/${o.id}`} className="text-fg-heading hover:underline">{o.name}{o.parent && <span className="text-fg-muted"> · {o.parent.name}</span>}</Link>,
            type: o.type === 'university' ? 'University' : 'Club',
            country: countryName(o.country) ?? '',
            source: o.rorId ? <StatusPill tone="info">University list</StatusPill> : o.verified ? <StatusPill tone="success">Verified</StatusPill> : <StatusPill tone="warning">Added by a builder</StatusPill>,
            members: <span className="tabular-nums">{o._count.members + o._count.clubMembers}</span>,
            added: o.createdAt.toISOString().slice(0, 10),
          },
        }))}
      />
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ q, view }} />
    </>
  )
}
