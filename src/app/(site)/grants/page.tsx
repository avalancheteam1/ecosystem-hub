import type { Metadata } from 'next'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import { Layers, CheckCircle2, CircleMinus, UsersRound, ArrowUpRight } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BuilderHubGrantsLink, DiscoveryNav } from './_components/navigation'
import { publishedRounds } from './_lib/queries'

export const metadata: Metadata = {
  title: 'Grants',
  description: 'Focused support for useful milestones in the Avalanche ecosystem.',
  ...canonical('/grants'),
}
export const dynamic = 'force-dynamic'
export default async function GrantsPage() {
  const rounds = await publishedRounds()
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading
        title={
          <>
            Grants<span className="text-brand">.</span>
          </>
        }
      >
        Focused support for your next useful milestone on Avalanche.
      </SectionHeading>
      <DiscoveryNav active="Programmes" />
      <div className="grid gap-6 md:grid-cols-[1.27fr_1fr]">
        <Card className="border-line bg-surface-2">
          <CardContent>
            <h2 className="text-2xl">Mini Grants</h2>
            <p className="mt-4 flex items-center gap-3">
              <Layers className="size-5" aria-hidden /> Up to $10,000
            </p>
            <p className="mt-2 flex items-center gap-3">
              {rounds.length ? <CheckCircle2 className="size-5" aria-hidden /> : <CircleMinus className="size-5" aria-hidden />}
              {rounds.length ? 'Open applications' : 'No open Hub round'}
            </p>
            <p className="mt-6 max-w-[280px] text-lg">
              For early-stage builders and community initiatives with a concrete Avalanche outcome.
            </p>
            <Link className={buttonVariants({ className: 'mt-8' })} href="/grants/mini-grants">
              View programme
            </Link>
          </CardContent>
        </Card>
        <Card className="border-line bg-surface-2">
          <CardContent>
            <h2 className="text-2xl">Accelerator Grants</h2>
            <p className="mt-4 flex items-center gap-3">
              <Layers className="size-5" aria-hidden /> Up to $30,000
            </p>
            <p className="mt-2 flex items-center gap-3">
              <UsersRound className="size-5" aria-hidden /> Committee selected
            </p>
            <p className="mt-6 max-w-[280px] text-lg">
              Projects are proposed and voted on by the committee. Strong projects can be fast-tracked without a Mini Grant.
            </p>
            <Link href="/grants/how-it-works" className="mt-8 inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
              How selection works
            </Link>
          </CardContent>
        </Card>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-fg-muted">
        <p>Participation does not guarantee funding.</p>
        <BuilderHubGrantsLink />
        <Link className="inline-flex min-h-11 items-center gap-2" href="/grants/applications">
          My applications <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  )
}
