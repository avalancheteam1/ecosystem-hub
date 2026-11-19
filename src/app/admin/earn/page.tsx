import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { formatUtc } from '@/lib/dates'
import { pageParam } from '@/lib/params'
import { listBountiesForPublishing } from '@/app/(site)/earn/_lib/queries'

export const metadata: Metadata = { title: 'Earn publishing' }

export default async function EarnAdminPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = pageParam((await searchParams).page)
  const { rows, hasMore } = await listBountiesForPublishing(page)
  return (
    <>
      <PageHeader title="Earn publishing" description="Draft and publish public team1 bounties.">
        <Button asChild><Link href="/admin/earn/new">New bounty</Link></Button>
      </PageHeader>
      {rows.length ? (
        <SectionCard title="Bounties">
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/admin/earn/${row.id}`} className="inline-flex min-h-11 items-center break-words font-medium text-fg-heading hover:text-brand">{row.title}</Link>
                  <p className="text-sm text-fg-muted">Deadline {formatUtc(row.deadline)}</p>
                </div>
                <StatusPill tone={row.publishedAt && !row.cancelledAt ? 'success' : 'neutral'}>{row.cancelledAt ? 'Cancelled' : row.publishedAt ? 'Public' : 'Draft'}</StatusPill>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : <EmptyState title="No bounties on this page">New bounties start as private drafts.</EmptyState>}
      <div className="[&_a]:min-h-11"><Pager page={page} hasMore={hasMore} params={{}} /></div>
    </>
  )
}
