import type { Metadata } from 'next'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { BackLink } from '@/components/back-link'
import { buttonVariants } from '@/components/ui/button'
import { BuilderHubGrantsLink } from '../_components/navigation'
import { publishedRounds } from '../_lib/queries'

export const metadata: Metadata = {
  title: 'Mini Grants',
  description: 'Focused support for one useful Avalanche milestone, with evidence and clear acceptance.',
  ...canonical('/grants/mini-grants'),
}
export const dynamic = 'force-dynamic'
export default async function MiniGrantsPage() {
  const rounds = await publishedRounds()
  return (
    <div className="container-page py-10">
      <BackLink href="/grants">All programmes</BackLink>
      <PageHeader
        title="Mini Grants"
        description="Your next useful milestone. Focused support for early-stage builders and community initiatives with a concrete Avalanche outcome."
      >
        <span className="text-lg">Up to $10,000</span>
      </PageHeader>
      <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-xl">What makes a clear application</h2>
          <ul className="list-disc space-y-3 pl-5">
            <li>A specific problem and the people who benefit.</li>
            <li>A useful, verifiable Avalanche deliverable.</li>
            <li>Itemised costs for the remaining work.</li>
            <li>A maintainer, delivery date and acceptance test.</li>
          </ul>
          <p>Reuse your existing Hub project. Submission seals the project version, so later edits do not change what reviewers assess.</p>
          <Link href={rounds.length ? '/grants/mini-grants/apply' : '/grants/applications'} className={buttonVariants()}>
            {rounds.length ? 'Start application' : 'View my applications'}
          </Link>
        </section>
        <aside className="border-t border-line pt-6 text-sm text-fg-muted md:border-t-0 md:border-l md:pt-0 md:pl-8">
          <h2 className="text-lg">Before you begin</h2>
          <p className="mt-3">
            Use an existing project, report overlapping funding and agree an acceptance test. Funding and terms are decided separately from
            the assessment score.
          </p>
          <p className="mt-4">
            {rounds.length ? `${rounds.length} round(s) currently accepting applications.` : 'There is no open application round on this Hub.'}
          </p>
          {!rounds.length && <BuilderHubGrantsLink />}
        </aside>
      </div>
    </div>
  )
}
