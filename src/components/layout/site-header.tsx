import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { holdsAny } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Logo } from './logo'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

export async function SiteHeader() {
  const user = await getCurrentUser()
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-line bg-surface-0/80 backdrop-blur-md">
      <div className="container-page flex h-full items-center justify-between gap-4">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <UserMenu user={{ name: user.name, email: user.email, image: user.image, showAdmin: holdsAny(user) }} />
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
