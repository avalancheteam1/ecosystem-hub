import type { Metadata } from 'next'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import { isFlagOn } from '@/lib/flag-store'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { BackLink } from '@/components/back-link'
import { buttonVariants } from '@/components/ui/button'
import { BuilderHubGrantsLink, RoundIntakeStatus } from '../_components/navigation'
import { publishedRounds } from '../_lib/queries'

export const metadata: Metadata = {
  title: 'Mini Grants',
  description: 'Focused support for one useful Avalanche milestone, with evidence and clear acceptance.',
  ...canonical('/grants/mini-grants'),
}
export const dynamic = 'force-dynamic'
export default async function MiniGrantsPage() {
  const continuous = await isFlagOn('miniGrantsIntake')
  const rounds = continuous ? [] : await publishedRounds()
  const intakeOpen = continuous || rounds.length > 0
  return (
    <div className="container-page py-10">
      <BackLink href="/grants">All programmes</BackLink>
      <PageHeader
        title="Mini Grants"
        description={continuous
          ? 'Funding for the next milestone of a working project or prototype in the Avalanche ecosystem.'
          : 'Your next useful milestone. Focused support for early-stage builders and community initiatives with a concrete Avalanche outcome.'}
      >
        <span className="text-lg">Up to $10,000</span>
      </PageHeader>
      <div className="grid gap-10 md:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-xl">What makes a clear application</h2>
          <ul className="list-disc space-y-3 pl-5">
            <li>A specific problem and the people who benefit.</li>
            <li>A useful, verifiable Avalanche deliverable.</li>
            {continuous
              ? <li>A demo link on your Hub project that shows the working product or prototype.</li>
              : <li>Itemised costs for the remaining work.</li>}
            <li>{continuous
              ? 'A delivery date and the evidence you will provide on completion.'
              : 'A maintainer, delivery date and acceptance test.'}</li>
          </ul>
          <p>Reuse your existing Hub project. Submission seals the project version, so later edits do not change what reviewers assess.</p>
          <Link href={intakeOpen ? '/grants/mini-grants/apply' : '/grants/applications'} className={buttonVariants()}>
            {intakeOpen ? 'Start application' : 'View my applications'}
          </Link>
        </section>
        {continuous ? (
          <SectionCard title="Apply anytime">
            <RoundIntakeStatus open />
            <p className="mt-4 text-sm text-fg-muted">Sign in with your Hub account to choose a project. You can save your draft and finish it later.</p>
          </SectionCard>
        ) : <SectionCard title="Application rounds">
          <RoundIntakeStatus open={rounds.length > 0} />
          {rounds.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {rounds.map((round) => <li key={round.id}>{round.name}</li>)}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">You can still open existing applications and respond to requests.</p>
          )}
          <p className="mt-4 text-sm text-fg-muted">The grant team opens and closes intake for each round. Choose an open round when applying.</p>
          {!rounds.length && <BuilderHubGrantsLink />}
        </SectionCard>}
      </div>
    </div>
  )
}
