'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function EarnNavLink({ className, ...props }: Omit<ComponentProps<typeof Link>, 'href' | 'children' | 'aria-current'>) {
  const pathname = usePathname()
  const current = pathname === '/earn' ? 'page' : pathname?.startsWith('/earn/') ? 'location' : undefined

  return <Link {...props} href="/earn" aria-current={current}
    className={cn(className, current && 'text-fg-heading underline decoration-brand underline-offset-4')}>Earn</Link>
}
