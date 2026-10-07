import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { SearchForm } from '@/components/layout/search-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { textParam } from '@/lib/params'
import { envSuperAdminEmails } from '@/lib/session'
import { isPermission } from '@/lib/permissions'
import { userSearchWhere } from '@/lib/user-search'
import { DeleteRoleButton, RoleDialog } from './_components/role-dialog'

export const metadata: Metadata = { title: 'Access' }

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireSuperAdmin()
  const q = textParam((await searchParams).q)
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ orderBy: { label: 'asc' }, include: { _count: { select: { users: true } } } }),
    q
      ? prisma.user.findMany({ where: userSearchWhere(q), take: 20, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true, isSuperAdmin: true } })
      : prisma.user.findMany({
          where: {
            OR: [
              { isSuperAdmin: true },
              { email: { in: envSuperAdminEmails(), mode: 'insensitive' } },
              { roles: { some: {} } },
              { permissions: { some: {} } },
            ],
          },
          take: 50,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true, isSuperAdmin: true },
        }),
  ])

  return (
    <>
      <PageHeader title="Access" description="Roles bundle permissions; assign roles or single permissions to people.">
        <RoleDialog trigger={<Button size="sm"><Plus aria-hidden /> New role</Button>} />
      </PageHeader>

      <section className="mb-12">
        <h2 className="mb-3 text-lg">Roles</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Holders</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map(({ _count, ...role }) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <div className="text-fg-heading">{role.label}</div>
                    <code className="text-xs text-fg-faint">{role.slug}</code>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {role.permissions.map((p) => (
                      <Badge key={p} variant={isPermission(p) ? 'secondary' : 'outline'} title={isPermission(p) ? undefined : 'Unknown key — ignored'}>{p}</Badge>
                    ))}
                  </TableCell>
                  <TableCell>{_count.users}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <RoleDialog role={{ ...role, permissions: role.permissions.filter(isPermission) }} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                    <DeleteRoleButton role={role} holders={_count.users} />
                  </TableCell>
                </TableRow>
              ))}
              {roles.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-10 text-center text-fg-muted">No roles yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg">People</h2>
        <p className="mb-4 text-sm text-fg-muted">{q ? 'Search results.' : 'Everyone with any access. Search to find others.'}</p>
        <SearchForm q={q} placeholder="Search name or email" />
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/access/users/${u.id}`} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-surface-hover">
                <span className="min-w-0">
                  <span className="block truncate text-fg-heading">{u.name}</span>
                  <span className="block truncate text-sm text-fg-muted">{u.email}</span>
                </span>
                {u.isSuperAdmin && <Badge>Super admin</Badge>}
              </Link>
            </li>
          ))}
          {users.length === 0 && <li className="px-4 py-8 text-center text-fg-muted">No one found.</li>}
        </ul>
      </section>
    </>
  )
}
