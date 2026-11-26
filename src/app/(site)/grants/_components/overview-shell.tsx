'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { SectionHeading } from '@/components/section-heading'
import { DiscoveryNav } from './navigation'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, type ReactNode } from 'react'

const pages: Record<string, string> = {
  '/grants': 'Programmes',
  '/grants/applications': 'My applications',
  '/grants/how-it-works': 'How it works',
}

export function GrantsOverview({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const current = pages[pathname]
  const isLanding = pathname === '/grants'
  const backdrop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const artwork = backdrop.current
    if (!isLanding || !artwork) return

    let frame = 0
    const update = () => {
      frame = 0
      artwork.style.setProperty('--grants-parallax', `${Math.min(Math.max(window.scrollY, 0) * 0.2, 72)}px`)
    }
    function onScroll() {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [isLanding])

  if (!current) return children
  if (isLanding) {
    return (
      <div className="relative isolate">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[clamp(31rem,56vw,47rem)] overflow-hidden">
          <div ref={backdrop} className="absolute inset-x-0 -top-20 bottom-0 motion-safe:[transform:translateY(var(--grants-parallax,0px))]">
            <Image src="/grants/grants-backdrop.webp" alt="" fill sizes="100vw" loading="eager" className="object-cover object-[72%_center] opacity-10 sm:object-center dark:opacity-85" />
          </div>
          <div className="absolute inset-0 bg-linear-to-b from-background/45 via-background/20 to-background" />
        </div>
        <div className="container-page pb-14 sm:pb-20">
          <header className="mx-auto flex min-h-[21rem] max-w-5xl flex-col items-center justify-center gap-5 px-1 py-12 text-center sm:min-h-[26rem] sm:gap-6 sm:py-16">
            <h1 className="text-[clamp(3rem,8vw,7.5rem)] leading-[0.9] font-medium tracking-[-0.045em] uppercase dark:bg-linear-to-b dark:from-fg-heading dark:to-fg-muted dark:bg-clip-text dark:text-transparent">
              Builder Grants
            </h1>
            <p className="max-w-[34ch] text-lg text-fg-heading sm:text-2xl">Funding for your next milestone on Avalanche.</p>
            <Button asChild size="lg" className="mt-1 rounded-full px-6">
              <Link href="/grants#grant-programmes">Explore programmes <ArrowDown aria-hidden /></Link>
            </Button>
          </header>
          <DiscoveryNav active={current} />
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Grants<span className="text-brand">.</span></>}>
        Focused support for your next useful milestone on Avalanche.
      </SectionHeading>
      <DiscoveryNav active={current} />
      {children}
    </div>
  )
}
