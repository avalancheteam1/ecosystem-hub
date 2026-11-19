import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { pageParam } from '@/lib/params'
import { RevisionEvidence } from '../../../_components/revision-evidence'
import { SubmissionForm } from '../../../_components/submission-form'
import { WithdrawButton } from '../../../_components/withdraw-button'
import { contributorStatus, revisionAllowed, submissionLabels } from '../../../_lib/stage-rules'
import { getOwnReceipt } from '../../../_lib/workflow-queries'

export const metadata: Metadata = { title: 'Submission receipt', robots: { index: false } }

export default async function ReceiptPage({ params, searchParams }: {
  params: Promise<{ id: string; entryId: string }>
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const { id, entryId } = await params
  const page = pageParam((await searchParams).page)
  const entry = await getOwnReceipt(id, entryId, page)
  if (!entry) notFound()
  const { stage } = entry
  const bounty = stage.bounty
  const open = !bounty.cancelledAt && !bounty.resultsAnnouncedAt && bounty.deadline > new Date()
  const latest = page === 1 ? entry.revisions[0] : undefined
  const canRevise = latest && open && !entry.stageApproved && revisionAllowed(stage.submissionPolicy, entry.status)
  const canWithdraw = open && entry.status !== 'approved' && entry.status !== 'withdrawn'
  const status = contributorStatus(entry.status, { final: entry.final, announced: !!bounty.resultsAnnouncedAt, awarded: !!entry.award, cancelled: !!bounty.cancelledAt })

  return (
    <div className="container-page max-w-4xl py-10">
      <BackLink href={bounty.cancelledAt ? '/earn/submissions' : `/earn/${id}?stage=${stage.id}`}>{bounty.cancelledAt ? 'My submissions' : bounty.title}</BackLink>
      <PageHeader title="Your submission receipt" description={`${stage.title} · revision ${entry.revision}`}><StatusPill>{status}</StatusPill></PageHeader>
      <div className="space-y-6">
        {bounty.cancelledAt && <SectionCard title="Bounty cancelled"><p>{bounty.title} is closed. Your receipt and its history are still available.</p></SectionCard>}
        {entry.award && <SectionCard title="Your award"><p className="break-words">{entry.award.reward}</p><p className="mt-2 text-sm">{entry.award.rewardedAt ? 'External reward recorded' : 'Awaiting external reward'}</p></SectionCard>}
        <SectionCard title="Revision history" actions={canWithdraw ? <WithdrawButton key={entry.version} bountyId={id} id={entry.id} version={entry.version} /> : undefined}>
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
          <Pager page={page} hasMore={entry.hasMore} params={{}} />
        </SectionCard>
        {canRevise && bounty.terms && <SectionCard title="Revise your submission">
          <SubmissionForm key={entry.version} bountyId={id} stageId={stage.id} requiresPullRequest={stage.requiresPullRequest} terms={bounty.terms} termsVersion={bounty.termsVersion} revision={{ ...latest, id: entry.id, version: entry.version }} />
        </SectionCard>}
      </div>
    </div>
  )
}
