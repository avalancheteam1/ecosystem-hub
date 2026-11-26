import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { Markdown } from '@/components/markdown'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { requirePermission } from '@/lib/guards'
import { pageParam } from '@/lib/params'
import { can } from '@/lib/permissions'
import { RevisionEvidence } from '@/app/(site)/earn/_components/revision-evidence'
import { submissionLabels } from '@/app/(site)/earn/_lib/stage-rules'
import { getSubmissionForReview } from '@/app/(site)/earn/_lib/workflow-queries'
import { RemoveSelection, ReviewForm } from '../../_components/review-form'

export const metadata: Metadata = { title: 'Review submission' }

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePermission('earn.review')
  const page = pageParam((await searchParams).page)
  const view = await getSubmissionForReview((await params).id, page)
  if (!view) notFound()
  const { row, user, reviews, hasMore } = view
  const { stage } = row
  const final = stage.position === stage.bounty._count.stages
  const afterDeadline = stage.bounty.deadline <= new Date()
  const authorized = user.id !== row.contributorId && !stage.bounty.resultsAnnouncedAt && !stage.bounty.cancelledAt
  const canReview = authorized && (row.status === 'pending' || row.status === 'needs_review')
  const canRemove = authorized && final && row.status === 'approved' && can(user, 'earn.finalize')
  const status = stage.bounty.cancelledAt ? 'Bounty cancelled' : final && row.status === 'approved' ? stage.bounty.resultsAnnouncedAt ? 'Awarded' : 'Selected privately' : submissionLabels[row.status]
  return (
    <>
      <BackLink href={`/admin/earn/review?bounty=${stage.bountyId}`}>Review queue</BackLink>
      <PageHeader title={row.contributor.name} description={`${stage.bounty.title} · ${stage.title} · revision ${row.revision}`}><StatusPill>{status}</StatusPill></PageHeader>
      <div className="space-y-6">
        <SectionCard title="Review this revision">
          {stage.deliverables && <Markdown className="mb-3 wrap-anywhere">{stage.deliverables}</Markdown>}
          {canReview && final && !afterDeadline && <p className="mb-3 text-sm text-fg-muted">Final selection opens after the deadline.</p>}
          {canReview && final && afterDeadline && !can(user, 'earn.finalize') && <p className="mb-3 text-sm text-fg-muted">Final selection requires the award selection permission.</p>}
          {canReview && page === 1 && (
            <ReviewForm key={row.version} id={row.id} bountyId={stage.bountyId} version={row.version} afterDeadline={afterDeadline} alreadyInReview={row.status === 'needs_review'}
              canApprove={!final || (afterDeadline && can(user, 'earn.finalize'))} final={final} />
          )}
          {user.id === row.contributorId && <p>You cannot review your own submission.</p>}
          {canRemove && <RemoveSelection key={row.version} id={row.id} bountyId={stage.bountyId} version={row.version} />}
          {!canReview && !canRemove && user.id !== row.contributorId && <p>This revision is closed to review.</p>}
        </SectionCard>
        <SectionCard title="Revision and decision history">
          {!row.revisions.length && <p>No revisions on this page.</p>}
          <ol className="space-y-4">{row.revisions.map((item) => (
            <li key={item.number} className="rounded-lg border border-line p-4">
              <h3 className="mb-2">Revision {item.number}</h3>
              <RevisionEvidence revision={item} />
              <ul className="mt-3 space-y-2">{reviews.filter((review) => review.revision === item.number).map((review) => (
                <li key={review.id} className="rounded-lg border border-line p-3">
                  <p className="font-medium">{submissionLabels[review.decision]}</p>
                  {review.feedback && <p className="whitespace-pre-wrap break-words">Contributor feedback · {review.feedback}</p>}
                  {review.internalNote && <p className="whitespace-pre-wrap break-words">Internal note · {review.internalNote}</p>}
                </li>
              ))}</ul>
            </li>
          ))}</ol>
          <Pager page={page} hasMore={hasMore} params={{}} />
        </SectionCard>
      </div>
    </>
  )
}
