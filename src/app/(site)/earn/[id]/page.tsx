import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { ExternalLink } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
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

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const bounty = await getBounty((await params).id)
  if (!bounty) notFound()
  const open = bounty.deadline > new Date()

  return (
    <div className="container-page py-10 sm:py-14">
      <BackLink href="/earn">All bounties</BackLink>
      <PageHeader title={bounty.title} description={`team1 · ${bounty.category}`}>
        <StatusPill tone={open ? 'success' : 'neutral'}>{open ? 'Open' : 'Closed'}</StatusPill>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="The bounty"><p className="whitespace-pre-wrap break-words">{bounty.description}</p></SectionCard>
          <SectionCard title="What to deliver"><p className="whitespace-pre-wrap break-words">{bounty.deliverables}</p></SectionCard>
          <SectionCard title="How to participate">
            {open ? (
              <>
                <p className="whitespace-pre-wrap break-words">{bounty.participation}</p>
                {bounty.participationUrl && (
                  <a href={bounty.participationUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 underline underline-offset-4">
                    Open participation link <ExternalLink className="size-4" aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </>
            ) : <p>This bounty’s deadline has passed.</p>}
          </SectionCard>
        </div>
        <aside className="space-y-6" aria-label="Bounty details">
          <SectionCard title="Reward and deadline">
            <p className="break-words text-2xl text-fg-heading">{bounty.reward}</p>
            <time dateTime={bounty.deadline.toISOString()} className="mt-3 block text-fg-body">{formatUtc(bounty.deadline)}</time>
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
