import type { Metadata } from 'next'
import { canonical } from '@/lib/metadata'
import Link from 'next/link'
import Image from 'next/image'
import { Layers, UsersRound, Globe } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { BuilderHubGrantsLink, RoundIntakeStatus } from './_components/navigation'
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
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="overflow-hidden border-line bg-surface-2 pt-0">
          <div className="relative aspect-[2/1] overflow-hidden bg-surface-1">
            <Image src="https://www.team1.network/grants/mini.jpg" alt="" fill loading="eager" sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          </div>
          <CardContent>
            <h2 className="text-2xl">Mini Grants</h2>
            <p className="mt-4 flex items-center gap-3">
              <Layers className="size-5" aria-hidden /> Up to $10,000
            </p>
            <div className="mt-3"><RoundIntakeStatus open={rounds.length > 0} /></div>
            <p className="mt-6 max-w-prose text-base text-fg-muted">
              For early-stage builders and community initiatives with a concrete Avalanche outcome.
            </p>
            <Link className={buttonVariants({ className: 'mt-6' })} href="/grants/mini-grants">
              View programme
            </Link>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-line bg-surface-2 pt-0">
          <div className="relative aspect-[2/1] overflow-hidden bg-surface-1">
            <Image src="https://www.team1.network/grants/builder.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
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
            <Link href="/grants/how-it-works" className="mt-6 inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
              How selection works
            </Link>
          </CardContent>
        </Card>
      </div>
      <Card className="mt-6 border-line bg-surface-2">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-1">
            <Globe className="size-6 text-brand" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 basis-48">
            <h2 className="text-lg">Avalanche Builder Hub grants</h2>
            <p className="text-sm text-fg-muted">Explore grant programmes across the broader Avalanche ecosystem.</p>
          </div>
          <BuilderHubGrantsLink />
        </CardContent>
      </Card>
      <p className="mt-6 text-sm text-fg-muted">Participation does not guarantee funding.</p>
    </>
  )
}
