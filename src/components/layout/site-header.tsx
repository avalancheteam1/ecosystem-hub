import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { getHackathonRoles } from '@/app/(site)/events/_lib/hackathons/queries'
import { can, holdsAny } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { MobileNav } from './mobile-nav'
import { UserMenu } from './user-menu'

export async function SiteHeader() {
  const user = await getCurrentUser()
  const roles = user ? await getHackathonRoles(user.id) : null
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-line bg-surface-0/80 backdrop-blur-md">
      <div className="container-page flex h-full items-center justify-between gap-4 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Logo className="justify-self-start" />
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
          <Link href="/events" className="text-fg-muted transition-colors hover:text-fg-heading">Events</Link>
          <Link href="/education" className="text-fg-muted transition-colors hover:text-fg-heading">Education</Link>
          {/* ponytail: external until grants live in the hub */}
          <a href="https://build.avax.network/grants" target="_blank" rel="noopener noreferrer" className="text-fg-muted transition-colors hover:text-fg-heading">Grants</a>
          {user && (
            <>
              <span aria-hidden className="h-4 w-px bg-line" />
              <Link href="/dashboard" className="text-fg-muted transition-colors hover:text-fg-heading">Dashboard</Link>
              <Link href="/projects" className="text-fg-muted transition-colors hover:text-fg-heading">My Projects</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-1 justify-self-end sm:gap-2">
          <MobileNav signedIn={!!user} />
          <ThemeToggle />
          {user ? (
            <UserMenu user={{ name: user.name, email: user.email, image: user.image, showAdmin: holdsAny(user), showJudging: !!roles?.judge, showManage: !!roles?.organizer || can(user, 'hackathons.manage') }} />
          ) : (
            <>
              <Link href="/sign-in" className="hidden h-10 items-center px-2 text-sm text-fg-muted transition-colors hover:text-fg-heading sm:flex">Sign in</Link>
              <Button asChild size="sm" className="h-10 px-4">
                <Link href="/sign-in">Join</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
