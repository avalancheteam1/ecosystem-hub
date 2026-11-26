import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { pageParam } from '@/lib/params'
import { RevisionEvidence } from '../../../_components/revision-evidence'
import { SubmissionForm } from '../../../_components/submission-form'
import { SubmissionLineage } from '../../../_components/submission-lineage'
import { SubmissionStatusPill } from '../../../_components/submission-status-pill'
import { WithdrawButton } from '../../../_components/withdraw-button'
import { contributorStatus, submissionLabels } from '../../../_lib/stage-rules'
import { getOwnReceipt } from '../../../_lib/workflow-queries'

export const metadata: Metadata = { title: 'Submission', robots: { index: false } }

export default async function ReceiptPage({ params, searchParams }: {
  params: Promise<{ id: string; entryId: string }>
  searchParams: Promise<{ page?: string | string[]; edit?: string | string[] }>
}) {
  const { id, entryId } = await params
  const { page: requestedPage, edit } = await searchParams
  const page = pageParam(requestedPage)
  const entry = await getOwnReceipt(id, entryId, page)
  if (!entry) notFound()
  const { stage } = entry
  const bounty = stage.bounty
  const latest = page === 1 && entry.revisions[0]?.number === entry.revision ? entry.revisions[0] : undefined
  const revisionForm = latest && bounty.terms && entry.canRevise
    ? { terms: bounty.terms, revision: { ...latest, id: entry.id, version: entry.version } }
    : null
  const editing = edit === '1' ? revisionForm : null
  const status = contributorStatus(entry.status, { final: entry.final, announced: !!bounty.resultsAnnouncedAt, awarded: !!entry.award, cancelled: !!bounty.cancelledAt })
  const receiptPage = `?page=${page}`
  const editAction = revisionForm && !editing && (
    <Button asChild variant="outline">
      <Link id="edit-submission-link" href={`${receiptPage}&edit=1#edit-submission`} className="scroll-mt-20">Edit</Link>
    </Button>
  )

  return (
    <div className="container-page max-w-4xl py-10">
      <BackLink href={bounty.cancelledAt ? '/earn/submissions' : `/earn/${id}?stage=${stage.id}`}>{bounty.cancelledAt ? 'My submissions' : bounty.title}</BackLink>
      <PageHeader title="Your submission" description={`${stage.title} · revision ${entry.revision}`}><SubmissionStatusPill label={status} /></PageHeader>
      <div className="space-y-6">
        {bounty.cancelledAt && <SectionCard title="Bounty cancelled"><p>{bounty.title} is closed. Your submission and its history are still available.</p></SectionCard>}
        {entry.award && <SectionCard title="Your award"><p className="break-words">{entry.award.reward}</p><p className="mt-2 text-sm">{entry.award.rewardedAt ? 'External reward recorded' : 'Awaiting external reward'}</p></SectionCard>}
        <SubmissionLineage entries={entry.lineage} hrefPrefix={`/earn/${id}/receipts`} />
        <SectionCard title="Revision history" actions={editAction || entry.canWithdraw ? (
          <>
            {editAction}
            {entry.canWithdraw && <WithdrawButton key={entry.version} bountyId={id} id={entry.id} version={entry.version} />}
          </>
        ) : undefined}>
          {entry.revisions.length === 0 && <p>No revisions on this page.</p>}
          <ol className="space-y-4">{entry.revisions.map((item) => (
            <li key={item.number} className="rounded-lg border border-line p-4">
              <h3 className="mb-2">Revision {item.number}</h3>
              <RevisionEvidence revision={item} />
              {entry.reviews.filter((review) => review.revision === item.number && review.feedback).map((review) => (
                <p key={review.id} className="mt-2 whitespace-pre-wrap break-words">{submissionLabels[review.decision]} · {review.feedback}</p>
              ))}
            </li>
          ))}</ol>
          <div className="[&_a]:min-h-11 [&_a]:min-w-11"><Pager page={page} hasMore={entry.hasMore} params={{}} /></div>
        </SectionCard>
        {editing && (
          <div id="edit-submission" tabIndex={-1} className="scroll-mt-20">
            <SectionCard title="Revise your submission" actions={
              <Button asChild variant="outline"><Link href={`${receiptPage}#edit-submission-link`}>Cancel</Link></Button>
            }>
              <SubmissionForm key={entry.version} bountyId={id} stageId={stage.id} requiresPullRequest={stage.requiresPullRequest} githubIssueUrl={bounty.githubIssueUrl} termsVersion={bounty.termsVersion} {...editing} />
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  )
}
