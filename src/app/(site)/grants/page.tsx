import type { Metadata } from 'next'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import { isFlagOn } from '@/lib/flag-store'
import Image from 'next/image'
import { ChevronDown, Layers, UsersRound } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RoundIntakeStatus } from './_components/navigation'
import { publishedRounds } from './_lib/queries'

export const metadata: Metadata = {
  title: 'Grants',
  description: 'Focused support for useful milestones in the Avalanche ecosystem.',
  ...canonical('/grants'),
}
export const dynamic = 'force-dynamic'
function ProgrammeDetails({ children }: { children: React.ReactNode }) {
  return (
    <details className="group mt-6">
      <summary className={buttonVariants({ variant: 'outline', className: 'min-h-11 w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden' })}>
        Programme details <ChevronDown aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm text-fg-muted">{children}</div>
    </details>
  )
}

export default async function GrantsPage() {
  const [continuous, acceleratorOn] = await Promise.all([isFlagOn('miniGrantsIntake'), isFlagOn('acceleratorGrants')])
  const rounds = continuous ? [] : await publishedRounds()
  return (
    <>
      <section id="grant-programmes" aria-label="Grant programmes" className="grid scroll-mt-24 gap-6 md:grid-cols-2">
        <Card className="overflow-hidden border-line bg-surface-2 pt-0">
          <div className="relative aspect-[2/1] overflow-hidden bg-surface-1">
            <Image src="/grants/mini.jpg" alt="" fill loading="eager" sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          <CardContent>
            <h2 className="text-2xl">Mini Grants</h2>
            <p className="mt-4 flex items-center gap-3">
              <Layers className="size-5" aria-hidden /> Up to $10,000
            </p>
            <div className="mt-3"><RoundIntakeStatus open={continuous || rounds.length > 0} /></div>
            <p className="mt-6 max-w-prose text-base text-fg-muted">
              {continuous
                ? 'For builders with a working project or prototype and a concrete Avalanche outcome. Apply anytime.'
                : 'For early-stage builders and community initiatives with a concrete Avalanche outcome.'}
            </p>
            <ProgrammeDetails>
              <p>{continuous
                ? 'Use your Hub project to share a working demo and propose up to three milestones.'
                : 'Use your Hub project to describe the proposed work and how reviewers can verify it.'}</p>
              <Link className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4" href="/grants/mini-grants">
                Open Mini Grants
              </Link>
            </ProgrammeDetails>
          </CardContent>
        </Card>
        {acceleratorOn && <Card className="overflow-hidden border-line bg-surface-2 pt-0">
          <div className="relative aspect-[2/1] overflow-hidden bg-surface-1">
            <Image src="/grants/builder.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          <CardContent>
            <h2 className="text-2xl">Accelerator Grants</h2>
            <p className="mt-4 flex items-center gap-3">
              <Layers className="size-5" aria-hidden /> Up to $30,000
            </p>
            <p className="mt-2 flex items-center gap-3">
              <UsersRound className="size-5" aria-hidden /> Committee selected
            </p>
            <p className="mt-6 max-w-prose text-base text-fg-muted">
              Projects are proposed and voted on by the committee. Strong projects can be fast-tracked without a Mini Grant.
            </p>
            <ProgrammeDetails>
              <p>The Grants Committee nominates projects and votes on which ones to support.</p>
            </ProgrammeDetails>
          </CardContent>
        </Card>}
      </section>
      <p className="mt-6 text-sm text-fg-muted">Participation does not guarantee funding.</p>
    </>
  )
}
