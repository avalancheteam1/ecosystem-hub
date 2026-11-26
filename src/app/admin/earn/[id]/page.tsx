import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { Markdown } from '@/components/markdown'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Pager } from '@/components/layout/pager'
import { pageParam } from '@/lib/params'
import { can } from '@/lib/permissions'
import { requirePermission } from '@/lib/guards'
import { isFlagOn } from '@/lib/flag-store'
import { approvedNoticeCopy } from '@/app/(site)/earn/_lib/result-notices'
import { getResultsForPublishing, listPrivateSelections } from '@/app/(site)/earn/_lib/workflow-queries'
import { ResultsAction } from '../_components/results-action'
import { RemoveSelection } from '../_components/review-form'
import { formatUtc } from '@/lib/dates'
import { getBountyForPublishing, listEarnOrganizationOptions } from '@/app/(site)/earn/_lib/queries'
import { BountyForm } from '../_components/bounty-form'
import { PublicationButton } from '../_components/publication-button'

export const metadata: Metadata = { title: 'Manage bounty' }

export default async function ManageBountyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await requirePermission('earn.publish')
  const bounty = await getBountyForPublishing((await params).id)
  if (!bounty) notFound()
  const published = Boolean(bounty.publishedAt)
  const earnOn = await isFlagOn('earn')
  const page = pageParam((await searchParams).page)
  const { publishedAt, id, resultsAnnouncedAt, cancelledAt, cancellationReason, ...draft } = bounty
  const editable = !cancelledAt && !resultsAnnouncedAt
  const result = (published || editable) && bounty.stages.length ? await getResultsForPublishing(id, page) : null
  const organizations = editable ? await listEarnOrganizationOptions() : []
  const activity = !!resultsAnnouncedAt || !!result?.submitted
  const early = bounty.deadline > new Date()
  const final = bounty.stages.at(-1)
  const canReview = can(user, 'earn.review')
  const selections = published && editable && final && canReview && can(user, 'earn.finalize') ? await listPrivateSelections(id, page) : null
  const noticeCopyAvailable = published && editable && final ? approvedNoticeCopy() !== null : false
  return (
    <>
      <BackLink href="/admin/earn">Earn publishing</BackLink>
      <PageHeader title={bounty.title} description={cancelledAt ? `Cancelled ${formatUtc(cancelledAt)}` : publishedAt ? `Published ${formatUtc(publishedAt)}${earnOn ? '' : ' · Earn is turned off'}` : 'Private draft'}>
        {earnOn && published && !cancelledAt && <Button asChild variant="outline"><Link href={`/earn/${bounty.id}`}>View public brief</Link></Button>}
      </PageHeader>
      <div className="space-y-6">
        <SectionCard title="Publication" description={published && editable ? 'You can edit this brief until results are announced.' : !published ? 'Publishing uses the last saved draft.' : undefined}>
          {cancelledAt ? <p className="whitespace-pre-wrap break-words">Staff reason · {cancellationReason}</p> : (
            <div className="flex flex-wrap items-center gap-3">
              {published && activity ? <p>This bounty has recorded activity and must stay published.</p> : <PublicationButton key={bounty.revision} id={id} revision={bounty.revision} published={published} />}
              {published && user.isSuperAdmin && !resultsAnnouncedAt && <ResultsAction action="cancel" id={id} revision={bounty.revision} />}
            </div>
          )}
        </SectionCard>
        {!editable && bounty.stages.length > 0 && <SectionCard title="Stages">
          <ol className="space-y-3">{bounty.stages.map((stage) => <li key={stage.id} className="break-words">
            <p>{stage.position}. {stage.title}{stage.requiresPullRequest ? ' · GitHub PR' : ''}</p>
            {stage.deliverables && <Markdown className="wrap-anywhere text-sm">{stage.deliverables}</Markdown>}
          </li>)}</ol>
        </SectionCard>}
        {published && result && !cancelledAt && <SectionCard title={resultsAnnouncedAt ? 'Announced awards' : 'Results'}>
          {resultsAnnouncedAt ? <p className="mb-4 text-sm text-fg-body">Announced {formatUtc(resultsAnnouncedAt)}</p> : (
            <div className="mb-4 space-y-1 text-sm text-fg-body">
              <p>{result.selected} privately selected · {result.submitted} total entries</p>
              <p>{final?.approvalLimit == null ? 'Final-stage approval limit is unset.' : `Final-stage approval limit: ${final.approvalLimit}`}</p>
              <p>{noticeCopyAvailable ? 'Approved result notices are configured.' : 'Result notices are unavailable until approved copy is available.'}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canReview && <Button asChild variant="outline"><Link href={`/admin/earn/review?bounty=${id}`}>Review submissions</Link></Button>}
            {user.isSuperAdmin && !resultsAnnouncedAt && <ResultsAction action="announce" id={id} revision={bounty.revision} selected={result.selected} deadline={formatUtc(bounty.deadline)} early={early} />}
          </div>
          {selections && <div className="mt-4">
            <h3 className="text-lg">Private selections</h3>
            {!selections.rows.length && <p className="mt-2 text-sm text-fg-muted">No private selections on this page.</p>}
            <ul className="divide-y divide-line">{selections.rows.map((entry, index) => {
              const entryLabel = `${entry.contributor.name}, revision ${entry.revision} (selection ${index + 1})`
              return (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <p className="wrap-anywhere">{entry.contributor.name} · revision {entry.revision}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="min-h-11">
                      <Link href={`/admin/earn/review/${entry.id}#remove-selection`} aria-label={`Review selection for ${entryLabel}`}>Review selection</Link>
                    </Button>
                    {entry.canRemove && <RemoveSelection key={entry.version} bountyId={id} id={entry.id} version={entry.version} entryLabel={entryLabel} />}
                  </div>
                </li>
              )
            })}</ul>
            <Pager page={page} hasMore={selections.hasMore} params={{}} />
          </div>}
          {resultsAnnouncedAt && <ul className="mt-4 divide-y divide-line">{result.rows.map((award) => <li key={award.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-words">{award.submission?.contributor.name ?? 'Former contributor'} · {award.reward}</p><p className="text-sm text-fg-muted">{award.rewardedAt ? `Recorded ${formatUtc(award.rewardedAt)}` : 'Awaiting external reward'}</p>{award.rewardNote && <p className="mt-2 whitespace-pre-wrap break-words text-sm">Staff note · {award.rewardNote}</p>}</div>
            {!award.rewardedAt && <ResultsAction action="reward" id={award.id} bountyId={id} />}
          </li>)}</ul>}
          {resultsAnnouncedAt && <Pager page={page} hasMore={result.hasMore} params={{}} />}
        </SectionCard>}
        {editable && <BountyForm key={bounty.revision} id={id} initial={draft} organizations={organizations} published={published} stagesLocked={activity} />}
      </div>
    </>
  )
}
