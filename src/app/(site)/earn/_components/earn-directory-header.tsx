import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { cn } from '@/lib/utils'

const views = [
  { href: '/earn', label: 'Browse bounties' },
  { href: '/earn/submissions', label: 'My submissions' },
] as const

export function EarnDirectoryHeader({ current, signedIn }: {
  current: typeof views[number]['href']
  signedIn: boolean
}) {
  return (
    <>
      <PageHeader title="Earn" description="Find public team1 bounties to contribute to the Avalanche ecosystem.">
        <a href="https://members.team1.network" className="inline-flex min-h-11 items-center gap-2 text-sm text-fg-muted underline underline-offset-4 hover:text-fg-heading">
          Member Portal <ExternalLink className="size-4" aria-hidden />
        </a>
      </PageHeader>
      {signedIn && (
        <nav aria-label="Earn views" className="mb-6 flex gap-1 border-b border-line">
          {views.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              scroll={false}
              aria-current={current === href ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors',
                current === href ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  )
}
