import type { Metadata } from 'next'
import { Plus } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
      <DataTable
        id="admin-api-keys"
        empty="No keys yet."
        columns={[
          { key: 'name', label: 'Name', sortable: true, hideable: false },
          { key: 'scopes', label: 'Scopes' },
          { key: 'lastUsedAt', label: 'Last used (UTC)', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'createdAt', label: 'Created', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'actions', label: '', hideable: false, className: 'text-right whitespace-nowrap' },
        ]}
        rows={keys.map((k) => ({
          id: k.id,
          className: k.revokedAt ? 'opacity-50' : undefined,
          sort: { name: k.name, lastUsedAt: k.lastUsedAt?.getTime(), createdAt: k.createdAt.getTime() },
          cells: {
            name: (
              <>
                <div className="text-fg-heading">{k.name}</div>
                <code className="text-xs text-fg-faint">hub_{k.prefix}_…</code>
              </>
            ),
            scopes: <span className="space-x-1">{k.scopes.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}</span>,
            lastUsedAt: fmt(k.lastUsedAt),
            createdAt: <>{fmt(k.createdAt)}{k.createdBy && <div className="text-xs text-fg-faint">{k.createdBy.name}</div>}</>,
            actions: k.revokedAt ? (
              <Badge variant="outline">Revoked</Badge>
            ) : (
              <>
                <ApiKeyDialog apiKey={k} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                <RevokeButton id={k.id} name={k.name} />
              </>
            ),
          },
        }))}
      />
    </>
  )
}
