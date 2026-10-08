import type { Metadata } from 'next'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { pageParam, sortParams, textParam } from '@/lib/params'
import { userSearchWhere } from '@/lib/user-search'

export const metadata: Metadata = { title: 'Users' }

const PAGE_SIZE = 50
const SORTS = ['name', 'email', 'createdAt'] as const

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; sort?: string | string[]; dir?: string | string[] }> }) {
  await requirePermission('users.view')
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const sort = sortParams(sp, SORTS, { key: 'createdAt', dir: 'desc' })
  const rows = await prisma.user.findMany({
    where: userSearchWhere(q),
    orderBy: [{ [sort.key]: sort.dir }, { id: 'asc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { id: true, name: true, email: true, createdAt: true, isSuperAdmin: true, roles: { select: { role: { select: { label: true } } } } },
  })
  const users = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Users" description="Everyone who has signed in to the Ecosystem Hub." />
      <SearchForm q={q} placeholder="Search name or email" />
      <DataTable
        id="admin-users"
        sort={sort}
        empty="No users found."
        columns={[
          { key: 'name', label: 'Name', sortable: true, hideable: false },
          { key: 'email', label: 'Email', sortable: true },
          { key: 'createdAt', label: 'Joined', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'roles', label: 'Roles' },
        ]}
        rows={users.map((u) => ({
          id: u.id,
          cells: {
            name: <span className="text-fg-heading">{u.name}</span>,
            email: u.email,
            createdAt: u.createdAt.toISOString().slice(0, 10),
            roles: (
              <span className="space-x-1">
                {u.isSuperAdmin && <Badge>Super admin</Badge>}
                {u.roles.map((r) => <Badge key={r.role.label} variant="secondary">{r.role.label}</Badge>)}
              </span>
            ),
          },
        }))}
      />
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ q, sort: sort.key, dir: sort.dir }} />
    </>
  )
}
