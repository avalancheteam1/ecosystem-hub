import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ExternalLink } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { Markdown } from '@/components/markdown'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { pageParam, textParam } from '@/lib/params'
import { BountyDeadline } from '../_components/bounty-deadline'
import { BountyStages } from '../_components/bounty-stages'
import { getAwardSummary } from '../_lib/workflow-queries'
import { formatUtc } from '@/lib/dates'
import { canonical, plainText } from '@/lib/metadata'
import { getPublicBounty } from '../_lib/queries'

const getBounty = cache(getPublicBounty)

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const bounty = await getBounty((await params).id)
  if (!bounty) return {}
  const description = plainText(bounty.description)
  return { title: bounty.title, description, ...canonical(`/earn/${bounty.id}`, { title: bounty.title, description }) }
}

export default async function BountyPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ stage?: string | string[]; page?: string | string[] }>
}) {
  const bounty = await getBounty((await params).id)
  if (!bounty) notFound()
  const open = !bounty.resultsAnnouncedAt && bounty.deadline > new Date()
  const { stage, page } = await searchParams
  const awardCount = bounty.resultsAnnouncedAt ? await getAwardSummary(bounty.id) : 0
  const status = bounty.resultsAnnouncedAt ? 'Results announced' : open ? 'Accepting submissions' : 'Submissions closed'

  return (
    <div className="container-page max-w-4xl py-10 sm:py-14 [&_h1]:wrap-anywhere">
      <BackLink href="/earn">All bounties</BackLink>
      <PageHeader title={bounty.title} description={`${bounty.organization.name} · ${bounty.category}`}>
        <div className="flex items-center gap-2">
          {bounty.logoUrl && <Image src={bounty.logoUrl} alt="" width={48} height={48} className="size-12 shrink-0 rounded-lg object-cover" />}
          <StatusPill tone={open ? 'success' : 'neutral'}>{status}</StatusPill>
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="The bounty"><Markdown className="wrap-anywhere">{bounty.description}</Markdown></SectionCard>
          <SectionCard title="What to deliver"><Markdown className="wrap-anywhere">{bounty.deliverables}</Markdown></SectionCard>
          {bounty.resultsAnnouncedAt && <SectionCard title="Results announced">
            <p>{awardCount ? `${awardCount} ${awardCount === 1 ? 'award' : 'awards'}` : 'No awards were selected.'}</p>
            {bounty.resultsNote && <Markdown className="mt-2 wrap-anywhere">{bounty.resultsNote}</Markdown>}
            <p className="mt-2 text-sm text-fg-muted">Contributors can check their own receipts for award details.</p>
          </SectionCard>}
          {bounty.stages.length > 0 && bounty.terms ? (
            <BountyStages instructions={bounty.participation} githubIssueUrl={bounty.githubIssueUrl} id={bounty.id} stages={bounty.stages} active={textParam(stage, 36)} page={pageParam(page)} open={open} resultsAnnounced={!!bounty.resultsAnnouncedAt} terms={bounty.terms} termsVersion={bounty.termsVersion} />
          ) : <SectionCard title="How to participate">
            {open ? (
              <>
                <Markdown className="wrap-anywhere">{bounty.participation}</Markdown>
                {bounty.participationUrl && (
                  <a href={bounty.participationUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 underline underline-offset-4">
                    Open participation link <ExternalLink className="size-4" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </>
            ) : <p>This bounty’s deadline has passed.</p>}
          </SectionCard>}
        </div>
        <aside className="min-w-0 space-y-6" aria-label="Bounty details">
          <SectionCard>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm text-fg-muted">Submission deadline</dt>
                <dd className="text-fg-heading"><BountyDeadline dateTime={bounty.deadline.toISOString()} utc={formatUtc(bounty.deadline)} /></dd>
                {bounty.resultsAnnouncedAt ? (
                  <dd className="mt-1 text-sm">Announced <time dateTime={bounty.resultsAnnouncedAt.toISOString()}>{formatUtc(bounty.resultsAnnouncedAt)}</time>.</dd>
                ) : !open && bounty.stages.length > 0 && (
                  <dd className="mt-1 text-sm">Review is underway. Results will appear here when announced.</dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-fg-muted">Reward</dt>
                <dd className="break-words text-2xl text-fg-heading">{bounty.reward}</dd>
              </div>
            </dl>
          </SectionCard>
          {bounty.hubModule && bounty.githubIssueUrl && (
            <SectionCard title="Hub feature">
              <p className="break-words">{bounty.hubModule}</p>
              <a href={bounty.githubIssueUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 underline underline-offset-4">
                Read GitHub issue <ExternalLink className="size-4" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
              </a>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
  )
}
