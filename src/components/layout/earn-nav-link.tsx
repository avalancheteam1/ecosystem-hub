'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function EarnNavLink(props: Omit<ComponentProps<typeof Link>, 'href' | 'children' | 'aria-current'>) {
  const pathname = usePathname()
  const current = pathname === '/earn' ? 'page' : pathname?.startsWith('/earn/') ? 'location' : undefined

  return <Link {...props} href="/earn" aria-current={current}>Earn</Link>
}
