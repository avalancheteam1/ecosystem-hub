import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const views = [
  { href: '/earn', label: 'Browse bounties' },
  { href: '/earn/submissions', label: 'My submissions' },
] as const

export function EarnViewNav({ current }: { current: typeof views[number]['href'] }) {
  return (
    <nav aria-label="Earn views" className="mb-6 flex flex-wrap gap-x-1 border-b border-line">
      {views.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
            current === href ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading',
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function EarnDirectory({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <div className="pb-10 sm:pb-14">
      <header className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <Image src="/earn/earn-backdrop.webp" alt="" fill sizes="100vw" loading="eager" className="object-cover object-[72%_center] opacity-[0.49] sm:object-center dark:opacity-85" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_44%_90%_at_50%_52%,color-mix(in_srgb,var(--background)_var(--earn-scrim),transparent),transparent_82%),linear-gradient(180deg,transparent_72%,var(--background))] [--earn-scrim:60%] dark:[--earn-scrim:74%]" />
        </div>
        <div className="container-page flex min-h-[20rem] flex-col items-center justify-center gap-5 py-12 text-center sm:min-h-[24rem] sm:gap-6 sm:py-16">
          <h1 className="text-[clamp(2.75rem,7vw,5rem)] leading-[1.02] font-medium tracking-[-0.02em] text-fg-heading">
            Earn
          </h1>
          <p className="max-w-[36ch] text-lg text-fg-heading sm:text-2xl">
            Find public team1 bounties to contribute to the Avalanche ecosystem.
          </p>
          <Button asChild size="lg">
            <Link href="#bounty-catalog">Explore bounties <ArrowDown aria-hidden /></Link>
          </Button>
        </div>
      </header>
      <div className="container-page">
        {signedIn && <EarnViewNav current="/earn" />}
        <div id="bounty-catalog" tabIndex={-1} className="scroll-mt-4">
          {children}
        </div>
      </div>
    </div>
  )
}
