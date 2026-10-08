'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  ['', 'Overview'],
  ['/tracks', 'Tracks & prizes'],
  ['/stages', 'Stages'],
  ['/registration', 'Registration'],
  ['/people', 'People'],
  ['/submissions', 'Submissions'],
  ['/judging', 'Judging'],
  ['/results', 'Results'],
] as const

export function ManageTabs({ base }: { base: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Hackathon setup" className="no-scrollbar -mx-4 mb-8 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-line)] sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {TABS.map(([path, label]) => {
          const href = base + path
          const active = path === '' ? pathname === base : pathname.startsWith(href)
          return (
            <li key={path}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn('inline-flex min-h-11 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors', active ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading')}
              >
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
