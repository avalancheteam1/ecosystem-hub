import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { formatUtc } from '@/lib/dates'
import { getBountyForPublishing } from '@/app/(site)/earn/_lib/queries'
import { BountyForm } from '../_components/bounty-form'
import { PublicationButton } from '../_components/publication-button'

export const metadata: Metadata = { title: 'Manage bounty' }

export default async function ManageBountyPage({ params }: { params: Promise<{ id: string }> }) {
  const bounty = await getBountyForPublishing((await params).id)
  if (!bounty) notFound()
  const published = Boolean(bounty.publishedAt)
  const { publishedAt, id, ...draft } = bounty
  return (
    <>
      <BackLink href="/admin/earn">Earn publishing</BackLink>
      <PageHeader title={bounty.title} description={publishedAt ? `Public since ${formatUtc(publishedAt)}` : 'Private draft'}>
        {published && <Button asChild variant="outline"><Link href={`/earn/${bounty.id}`}>View public brief</Link></Button>}
      </PageHeader>
      <div className="space-y-6">
        <SectionCard title="Publication" description={published ? 'Unpublish to make changes to the brief.' : 'Publishing uses the last saved draft.'}>
          <PublicationButton key={bounty.revision} id={bounty.id} revision={bounty.revision} published={published} />
        </SectionCard>
        {!published && <BountyForm key={bounty.revision} id={id} initial={draft} />}
      </div>
    </>
  )
}
