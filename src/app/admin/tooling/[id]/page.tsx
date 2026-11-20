import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getListingForReview } from '@/app/(site)/tooling/_lib/queries'
import { approveProblem } from '@/app/(site)/tooling/_lib/rules'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { ProjectVersionView } from '@/components/project-version-view'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { requirePermission } from '@/lib/guards'
import { ApproveButton, RejectButton, RemoveButton } from '../_components/review-actions'

export const metadata: Metadata = { title: 'Tooling review' }

const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? ''

export default async function ToolingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('tooling.review')
  const l = await getListingForReview((await params).id)
  if (!l) notFound()
  const seen = { listingId: l.id, approvedVersionId: l.approvedVersionId, pendingVersionId: l.pendingVersionId }
  const archived = !!l.project.archivedAt
  const name = (l.pendingVersion ?? l.newer ?? l.approvedVersion ?? l.project.currentVersion)?.name ?? l.project.slug
  // The versions a reviewer can act on: the submitted one, and a newer one the team saved since.
  const candidates = [
    ...(l.pendingVersion ? [{ v: l.pendingVersion, title: `Waiting for review: version ${l.pendingVersion.number}`, description: `Submitted ${day(l.submittedAt)}, public listing agreed ${day(l.consentAt)}.`, pending: true }] : []),
    ...(l.newer ? [{ v: l.newer, title: `Newer version ${l.newer.number}`, description: 'Saved by the team after the last submission. You can approve it without a resubmit; they agreed to later versions being listed.', pending: false }] : []),
  ]
  return (
    <>
      <BackLink href="/admin/tooling">Tooling</BackLink>
      <PageHeader title={name} description={`/tooling/${l.project.slug}`} />
      <div className="grid gap-6">
        <SectionCard title="Status">
          <div className="flex flex-wrap gap-2">
            {archived && <StatusPill tone="danger">Project deleted: hidden from /tooling</StatusPill>}
            {l.closedAt && <StatusPill tone={l.closedReason === 'removed' ? 'danger' : 'neutral'}>{l.closedReason === 'removed' ? 'Removed by a reviewer' : 'Withdrawn by the team'} on {day(l.closedAt)}</StatusPill>}
            {l.approvedVersion && <StatusPill tone="success">Listed: version {l.approvedVersion.number} since {day(l.approvedAt)}</StatusPill>}
            {!l.closedAt && !l.approvedVersion && <StatusPill>{l.pendingVersion ? 'Not listed yet' : 'Nothing listed or waiting'}</StatusPill>}
          </div>
          {l.closedReason === 'removed' && l.closedNote && <p className="mt-4 text-sm text-fg-body">Removal reason (the team sees it): “{l.closedNote}”</p>}
          {l.rejectedAt && (
            <p className="mt-4 text-sm text-fg-body">
              Last rejection {day(l.rejectedAt)}{l.rejectReason ? <>: “{l.rejectReason}”</> : ''} {l.rejectReason && <span className="text-fg-muted">({l.rejectReasonInternal ? 'internal' : 'the team sees it'})</span>}
            </p>
          )}
          {!l.closedAt && (l.approvedVersion || l.pendingVersion) && <div className="mt-4"><RemoveButton seen={seen} /></div>}
        </SectionCard>
        {candidates.map(({ v, title, description, pending }) => {
          const problem = approveProblem(l, v, archived)
          return (
            <SectionCard key={v.id} title={title} description={description}>
              {problem && <p className="mb-4 text-sm text-warning">Can’t approve: {problem}</p>}
              <div className="mb-8 flex flex-wrap gap-2">
                {!problem && <ApproveButton seen={seen} versionId={v.id} number={v.number} />}
                {pending && <RejectButton seen={seen} number={v.number} />}
              </div>
              <ProjectVersionView version={v} />
            </SectionCard>
          )
        })}
        {l.approvedVersion && (
          <SectionCard title={`Listed version ${l.approvedVersion.number}`}>
            <details>
              <summary className="cursor-pointer text-sm text-fg-muted">Show this version</summary>
              <div className="mt-6"><ProjectVersionView version={l.approvedVersion} /></div>
            </details>
          </SectionCard>
        )}
      </div>
    </>
  )
}
