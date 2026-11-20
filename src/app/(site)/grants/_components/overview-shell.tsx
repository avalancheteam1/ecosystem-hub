'use client'

import { usePathname } from 'next/navigation'
import { SectionHeading } from '@/components/section-heading'
import { DiscoveryNav } from './navigation'
import type { ReactNode } from 'react'

const pages: Record<string, string> = {
  '/grants': 'Programmes',
  '/grants/applications': 'My applications',
  '/grants/how-it-works': 'How it works',
}

export function GrantsOverview({ children }: { children: ReactNode }) {
  const current = pages[usePathname()]
  if (!current) return children
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
