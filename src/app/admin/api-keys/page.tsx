import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { ApiKeyDialog, RevokeButton } from './_components/api-key-dialog'

export const metadata: Metadata = { title: 'API keys' }

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—')

export default async function ApiKeysPage() {
  await requireSuperAdmin()
  const keys = await prisma.apiKey.findMany({
    orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    select: { id: true, name: true, prefix: true, scopes: true, revokedAt: true, lastUsedAt: true, createdAt: true, createdBy: { select: { name: true } } },
  })
  return (
    <>
      <PageHeader title="API keys" description="Server-to-server keys for /api/v1 (Cascade, member portal, …).">
        <ApiKeyDialog trigger={<Button size="sm"><Plus aria-hidden /> New key</Button>} />
      </PageHeader>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Last used (UTC)</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id} className={k.revokedAt ? 'opacity-50' : undefined}>
                <TableCell>
                  <div className="text-fg-heading">{k.name}</div>
                  <code className="text-xs text-fg-faint">hub_{k.prefix}_…</code>
                </TableCell>
                <TableCell className="space-x-1">{k.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(k.lastUsedAt)}</TableCell>
                <TableCell className="whitespace-nowrap">{fmt(k.createdAt)}{k.createdBy && <div className="text-xs text-fg-faint">{k.createdBy.name}</div>}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {k.revokedAt ? (
                    <Badge variant="outline">Revoked</Badge>
                  ) : (
                    <>
                      <ApiKeyDialog apiKey={k} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                      <RevokeButton id={k.id} name={k.name} />
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {keys.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-fg-muted">No keys yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
