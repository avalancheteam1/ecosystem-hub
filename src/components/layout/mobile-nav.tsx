'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/** Main nav below `md` - the inline links don't fit next to the logo on phones. */
export function MobileNav({ signedIn }: { signedIn: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-11 items-center justify-center rounded-lg text-fg-muted hover:text-fg-heading md:hidden" aria-label="Open menu">
        <Menu className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild><Link href="/events">Events</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/education/entrepreneur">Academy</Link></DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="https://build.avax.network/grants" target="_blank" rel="noopener noreferrer">Grants</a>
        </DropdownMenuItem>
        {signedIn && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/projects">My Projects</Link></DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
