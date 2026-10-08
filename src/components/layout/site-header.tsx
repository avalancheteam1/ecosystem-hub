import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { getHackathonRoles } from '@/app/(site)/events/_lib/hackathons/queries'
import { can, holdsAny } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export async function SiteHeader() {
  const user = await getCurrentUser()
  const roles = user ? await getHackathonRoles(user.id) : null
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-line bg-surface-0/80 backdrop-blur-md">
      <div className="container-page grid h-full grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Logo className="justify-self-start" />
        <nav aria-label="Main" className="flex items-center gap-6 text-sm">
          <Link href="/events" className="text-fg-muted transition-colors hover:text-fg-heading">Events</Link>
          {user && <Link href="/projects" className="text-fg-muted transition-colors hover:text-fg-heading">Projects</Link>}
        </nav>
        <div className="flex items-center gap-2 justify-self-end">
          <ThemeToggle />
          {user ? (
            <UserMenu user={{ name: user.name, email: user.email, image: user.image, showAdmin: holdsAny(user), showJudging: !!roles?.judge, showManage: !!roles?.organizer || can(user, 'hackathons.manage') }} />
          ) : (
            <Button asChild size="sm" className="h-10 px-4">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
