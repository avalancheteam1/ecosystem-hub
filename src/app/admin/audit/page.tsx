import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'

export const metadata: Metadata = { title: 'Audit log' }

const PAGE_SIZE = 100

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ type?: string | string[]; page?: string | string[] }> }) {
  await requireSuperAdmin()
  const sp = await searchParams
  const type = textParam(sp.type)
  const page = pageParam(sp.page)
  const [rows, types] = await Promise.all([
    prisma.auditLog.findMany({
      where: type ? { entityType: type } : {},
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ])
  const entries = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Audit log" description="Every state-changing admin action." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit"><Badge variant={type ? 'outline' : 'default'}>All</Badge></Link>
        {types.map(({ entityType }) => (
          <Link key={entityType} href={`?type=${encodeURIComponent(entityType)}`}>
            <Badge variant={type === entityType ? 'default' : 'outline'}>{entityType}</Badge>
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When (UTC)</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Change</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id} className="align-top">
                <TableCell className="whitespace-nowrap">{e.createdAt.toISOString().slice(0, 16).replace('T', ' ')}</TableCell>
                <TableCell>{e.actor ? e.actor.name : <span className="text-fg-faint">system</span>}</TableCell>
                <TableCell>
                  <code>{e.action}</code>
                  <div className="text-xs text-fg-faint">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</div>
                </TableCell>
                <TableCell>
                  {(e.before != null || e.after != null) && (
                    <details>
                      <summary className="text-sm text-fg-muted">Show</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto text-xs">{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
                    </details>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-fg-muted">Nothing logged yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ type }} />
    </>
  )
}
