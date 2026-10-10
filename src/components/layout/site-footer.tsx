import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { BUILDER_HUB_LINKS } from '@/lib/builder-hub'
import { Logo } from './logo'

const COLUMNS = [
  { title: 'Ecosystem Hub', links: [{ href: '/events', label: 'Events' }, { href: '/projects', label: 'Your projects' }, { href: '/dashboard', label: 'Dashboard' }] },
  { title: 'Avalanche Builder Hub', links: BUILDER_HUB_LINKS },
  { title: 'team1', links: [{ href: 'https://team1.network', label: 'team1.network' }, { href: 'https://cascade.team1.network', label: 'Cascade' }, { href: 'https://github.com/avalancheteam1', label: 'GitHub' }, { href: 'https://github.com/avalancheteam1/workshops', label: 'Workshops repo' }] },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-1">
      <div className="container-page grid gap-12 py-14 lg:grid-cols-[1fr_1.1fr] lg:py-20">
        <p className="font-heading text-[clamp(3.5rem,8vw,7.5rem)] font-medium leading-[0.88] tracking-[-0.05em] text-fg-heading">
          Keep<br /><span className="text-brand">building.</span>
        </p>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 self-end sm:grid-cols-3">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="meta mb-4">{c.title}</p>
              <ul className="space-y-2">
                {c.links.map((l) => {
                  const external = l.href.startsWith('http')
                  return (
                    <li key={l.href}>
                      <Link href={l.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} className="group inline-flex min-h-8 items-center gap-1 text-fg-body transition-colors hover:text-fg-heading">
                        {l.label}
                        {external && <ArrowUpRight className="arrow-nudge size-3.5 text-fg-faint" aria-hidden />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6">
          <Logo />
          <p className="meta flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} team1 - hub.team1.network</span>
            <a href="https://go.team1.network/privacy-policy" target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center hover:text-fg-heading">Privacy policy</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
