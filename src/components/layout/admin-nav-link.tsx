'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-heading [&_svg]:size-4',
        active && 'bg-surface-hover text-fg-heading [&_svg]:text-brand',
      )}
    >
      {children}
    </Link>
  )
}
