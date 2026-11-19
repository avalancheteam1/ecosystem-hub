import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { pageParam } from '@/lib/params'
import { contributorStatus } from '../_lib/stage-rules'
import { listMySubmissions } from '../_lib/workflow-queries'

export const metadata: Metadata = { title: 'My Earn submissions', robots: { index: false } }

export default async function MySubmissionsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = pageParam((await searchParams).page)
  const { rows, hasMore } = await listMySubmissions(page)
  return (
    <div className="container-page max-w-4xl py-10">
      <BackLink href="/earn">All bounties</BackLink>
      <PageHeader title="My submissions" description="Follow your submissions, revision feedback and announced awards." />
      {rows.length > 0 ? <SectionCard title="Your receipts">
        <ul className="divide-y divide-line">{rows.map((entry) => {
          const final = entry.stage.position === entry.stage.bounty._count.stages
          const label = contributorStatus(entry.status, {
            final, announced: !!entry.stage.bounty.resultsAnnouncedAt, awarded: !!entry.award, cancelled: !!entry.stage.bounty.cancelledAt,
          })
          return (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link href={`/earn/${entry.stage.bounty.id}/receipts/${entry.id}`} className="inline-flex min-h-11 items-center break-words text-fg-heading underline underline-offset-4">{entry.stage.bounty.title}</Link>
                <p className="break-words text-sm text-fg-muted">{entry.stage.title} · revision {entry.revision}</p>
              </div>
              <StatusPill>{label}</StatusPill>
            </li>
          )
        })}</ul>
      </SectionCard> : <EmptyState title="No submissions on this page">Your receipts appear here after you submit work.</EmptyState>}
      <Pager page={page} hasMore={hasMore} params={{}} />
    </div>
  )
}
