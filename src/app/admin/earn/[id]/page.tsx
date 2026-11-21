import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Pager } from '@/components/layout/pager'
import { pageParam } from '@/lib/params'
import { can } from '@/lib/permissions'
import { requirePermission } from '@/lib/guards'
import { getResultsForPublishing } from '@/app/(site)/earn/_lib/workflow-queries'
import { ResultsAction } from '../_components/results-action'
import { formatUtc } from '@/lib/dates'
import { getBountyForPublishing } from '@/app/(site)/earn/_lib/queries'
import { BountyForm } from '../_components/bounty-form'
import { PublicationButton } from '../_components/publication-button'

export const metadata: Metadata = { title: 'Manage bounty' }

export default async function ManageBountyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const bounty = await getBountyForPublishing((await params).id)
  if (!bounty) notFound()
  const published = Boolean(bounty.publishedAt)
  const user = await requirePermission('earn.publish')
  const page = pageParam((await searchParams).page)
  const result = published && bounty.stages.length ? await getResultsForPublishing(bounty.id, page) : null
  const { publishedAt, id, resultsAnnouncedAt, cancelledAt, cancellationReason, ...draft } = bounty
  const activity = !!resultsAnnouncedAt || !!result?.submitted
  const afterDeadline = bounty.deadline <= new Date()
  return (
    <>
      <BackLink href="/admin/earn">Earn publishing</BackLink>
      <PageHeader title={bounty.title} description={cancelledAt ? `Cancelled ${formatUtc(cancelledAt)}` : publishedAt ? `Public since ${formatUtc(publishedAt)}` : 'Private draft'}>
        {published && !cancelledAt && <Button asChild variant="outline"><Link href={`/earn/${bounty.id}`}>View public brief</Link></Button>}
      </PageHeader>
      <div className="space-y-6">
        <SectionCard title="Publication" description={published && !activity && !cancelledAt ? 'Unpublish to make changes to the brief.' : !published ? 'Publishing uses the last saved draft.' : undefined}>
          {cancelledAt ? <p className="whitespace-pre-wrap break-words">Staff reason · {cancellationReason}</p> : (
            <div className="flex flex-wrap items-center gap-3">
              {activity ? <p>The brief and stages are locked because the bounty has recorded activity.</p> : <PublicationButton key={bounty.revision} id={id} revision={bounty.revision} published={published} />}
              {published && user.isSuperAdmin && !resultsAnnouncedAt && <ResultsAction action="cancel" id={id} revision={bounty.revision} />}
            </div>
          )}
        </SectionCard>
        {(published || cancelledAt) && bounty.stages.length > 0 && <SectionCard title="Stages">
          <ol className="space-y-3">{bounty.stages.map((stage) => <li key={stage.id} className="break-words">
            <p>{stage.position}. {stage.title}{stage.requiresPullRequest ? ' · GitHub PR' : ''}</p>
            {stage.deliverables && <p className="text-sm text-fg-muted">{stage.deliverables}</p>}
          </li>)}</ol>
        </SectionCard>}
        {result && !cancelledAt && <SectionCard title={resultsAnnouncedAt ? 'Announced awards' : 'Results'}>
          <p className="mb-4 text-sm text-fg-body">{resultsAnnouncedAt ? `Announced ${formatUtc(resultsAnnouncedAt)}` : afterDeadline ? `${result.selected} privately selected · ${result.submitted} total entries` : 'Final selection opens after the deadline.'}</p>
          <div className="flex flex-wrap gap-2">
            {can(user, 'earn.review') && <Button asChild variant="outline"><Link href={`/admin/earn/review?bounty=${id}`}>Review submissions</Link></Button>}
            {user.isSuperAdmin && !resultsAnnouncedAt && afterDeadline && <ResultsAction action="announce" id={id} revision={bounty.revision} selected={result.selected} />}
          </div>
          {resultsAnnouncedAt && <ul className="mt-4 divide-y divide-line">{result.rows.map((award) => <li key={award.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words">{award.submission?.contributor.name ?? 'Former contributor'} · {award.reward}</p><p className="text-sm text-fg-muted">{award.rewardedAt ? `Recorded ${formatUtc(award.rewardedAt)}` : 'Awaiting external reward'}</p>{award.rewardNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm">Staff note · {award.rewardNote}</p>}</div>
            {!award.rewardedAt && <ResultsAction action="reward" id={award.id} bountyId={id} />}
          </li>)}</ul>}
          {resultsAnnouncedAt && <Pager page={page} hasMore={result.hasMore} params={{}} />}
        </SectionCard>}
        {!published && !cancelledAt && <BountyForm key={bounty.revision} id={id} initial={draft} />}
      </div>
    </>
  )
}
