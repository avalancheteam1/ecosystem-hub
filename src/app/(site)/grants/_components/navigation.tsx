import Link from 'next/link'
import { StatusPill } from '@/components/status-pill'

export function GrantTabs({ base, active, items, wrap = false }: { base: string; active: string; items: string[]; wrap?: boolean }) {
  return (
    <nav aria-label="Grant sections" className={`mb-10 flex gap-1 border-b border-line ${wrap ? 'flex-wrap' : 'no-scrollbar overflow-x-auto'}`}>
      {items.map((name) => (
        <Link
          key={name}
          href={`${base}?tab=${encodeURIComponent(name)}`}
          aria-current={active === name ? 'page' : undefined}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm transition-colors ${active === name ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading'}`}
        >
          {name}
        </Link>
      ))}
    </nav>
  )
}
export function DiscoveryNav({ active }: { active: string }) {
  return (
    <nav aria-label="Grant pages" className="no-scrollbar mb-10 flex gap-1 overflow-x-auto border-b border-line">
      {[
        ['Programmes', '/grants'],
        ['My applications', '/grants/applications'],
        ['How it works', '/grants/how-it-works'],
      ].map(([name, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={name === active ? 'page' : undefined}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm ${name === active ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading'}`}
        >
          {name}
        </Link>
      ))}
    </nav>
  )
}


export function BuilderHubGrantsLink() {
  return (
    <a
      href="https://build.avax.network/grants"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4"
    >
      Grants on Avalanche Builder Hub
    </a>
  )
}


export function RoundIntakeStatus({ open }: { open: boolean }) {
  return (
    <StatusPill tone={open ? 'success' : 'neutral'} className="text-fg-heading">
      {open ? 'Open for applications' : 'Closed to new applications'}
    </StatusPill>
  )
}
