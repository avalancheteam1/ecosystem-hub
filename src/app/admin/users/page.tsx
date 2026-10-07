import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'
import { userSearchWhere } from '@/lib/user-search'

export const metadata: Metadata = { title: 'Users' }

const PAGE_SIZE = 50

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  await requirePermission('users.view')
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const rows = await prisma.user.findMany({
    where: userSearchWhere(q),
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { id: true, name: true, email: true, createdAt: true, isSuperAdmin: true, roles: { select: { role: { select: { label: true } } } } },
  })
  const users = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Users" description="Everyone who has signed in to the hub." />
      <SearchForm q={q} placeholder="Search name or email" />
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Roles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="text-fg-heading">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="whitespace-nowrap">{u.createdAt.toISOString().slice(0, 10)}</TableCell>
                <TableCell className="space-x-1">
                  {u.isSuperAdmin && <Badge>Super admin</Badge>}
                  {u.roles.map((r) => <Badge key={r.role.label} variant="secondary">{r.role.label}</Badge>)}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-fg-muted">No users found.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ q }} />
    </>
  )
}
