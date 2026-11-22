import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const views = [
  { href: '/earn', label: 'Browse bounties' },
  { href: '/earn/submissions', label: 'My submissions' },
] as const

export function EarnDirectory({ current, signedIn, children }: {
  current: typeof views[number]['href']
  signedIn: boolean
  children: ReactNode
}) {
  const browsing = current === '/earn'
  return (
    <div className="pb-10 sm:pb-14">
      <header className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <Image src="/earn/earn-backdrop.webp" alt="" fill sizes="100vw" loading="eager" className="object-cover object-[72%_center] opacity-10 sm:object-center dark:opacity-85" />
          <div className="absolute inset-0 bg-linear-to-b from-background/45 via-background/20 to-background" />
        </div>
        <div className="container-page flex min-h-[20rem] flex-col items-center justify-center gap-5 py-12 text-center sm:min-h-[24rem] sm:gap-6 sm:py-16">
          <h1 className="text-[clamp(3.5rem,9vw,7.5rem)] leading-[0.9] font-medium tracking-[-0.045em] uppercase dark:bg-linear-to-b dark:from-fg-heading dark:to-fg-muted dark:bg-clip-text dark:text-transparent">
            Earn
          </h1>
          <p className="max-w-[36ch] text-lg text-fg-heading sm:text-2xl">
            Find public team1 bounties to contribute to the Avalanche ecosystem.
          </p>
          <Button asChild size="lg" className="min-h-11 rounded-full px-6">
            <Link href={browsing ? '#bounty-catalog' : '/earn#bounty-catalog'}>Explore bounties <ArrowDown aria-hidden /></Link>
          </Button>
        </div>
      </header>
      <div className="container-page">
        <div className="mb-6 flex flex-wrap items-end gap-x-4 border-b border-line">
          {signedIn && (
            <nav aria-label="Earn views" className="flex gap-1">
              {views.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  scroll={false}
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
          )}
          <a href="https://members.team1.network" className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted underline underline-offset-4 hover:text-fg-heading">
            Member Portal <ExternalLink className="size-4" aria-hidden />
          </a>
        </div>
        <div id={browsing ? 'bounty-catalog' : undefined} tabIndex={browsing ? -1 : undefined} className="scroll-mt-4">
          {children}
        </div>
      </div>
    </div>
  )
}
