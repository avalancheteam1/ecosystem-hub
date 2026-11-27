import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { pageParam } from '@/lib/params'
import { formatUtc } from '@/lib/dates'
import { EarnViewNav } from '../_components/earn-directory'
import { SubmissionStatusPill } from '../_components/submission-status-pill'
import { contributorStatus } from '../_lib/stage-rules'
import { listMySubmissions } from '../_lib/workflow-queries'

export const metadata: Metadata = { title: 'My Earn submissions', robots: { index: false } }

export default async function MySubmissionsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = pageParam((await searchParams).page)
  const { rows, hasMore } = await listMySubmissions(page)
  return (
    <div className="container-page max-w-4xl py-10 sm:py-14">
      <PageHeader title="My submissions" description="Open a submission to view its evidence, feedback and revision history." />
      <EarnViewNav current="/earn/submissions" />
      {rows.length > 0 ? <SectionCard title="Your submissions">
        <ul className="divide-y divide-line">{rows.map((entry) => {
          const final = entry.stage.position === entry.stage.bounty._count.stages
          const label = contributorStatus(entry.status, {
            final, announced: !!entry.stage.bounty.resultsAnnouncedAt, awarded: !!entry.award, cancelled: !!entry.stage.bounty.cancelledAt,
          })
          return (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <Link href={`/earn/${entry.stage.bounty.id}/receipts/${entry.id}`} className="inline-flex min-h-11 items-center wrap-anywhere text-fg-heading underline underline-offset-4">{entry.stage.bounty.title}</Link>
                <p className="break-words text-sm text-fg-muted">{entry.stage.title} · revision {entry.revision}</p>
                <p className="text-sm text-fg-muted">Submitted <time dateTime={entry.createdAt.toISOString()}>{formatUtc(entry.createdAt)}</time></p>
              </div>
              <SubmissionStatusPill label={label} />
            </li>
          )
        })}</ul>
      </SectionCard> : page === 1 ? (
        <EmptyState title="You haven’t submitted to a bounty yet" action={<Button asChild><Link href="/earn">Browse bounties</Link></Button>} />
      ) : <EmptyState title="No submissions on this page" />}
      <div className="[&_a]:min-h-11 [&_a]:min-w-11"><Pager page={page} hasMore={hasMore} params={{}} /></div>
    </div>
  )
}
