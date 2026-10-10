import type { Metadata } from 'next'
import Link from 'next/link'
import { Pager } from '@/components/layout/pager'
import { SectionHeading } from '@/components/section-heading'
import { pageParam } from '@/lib/params'
import { cn } from '@/lib/utils'
import { EventCard } from './_components/event-card'
import { listPublicEvents } from './_lib/queries'

export const metadata: Metadata = {
  title: 'Events',
  description: 'Hackathons, workshops and meetups for builders in the team1 community.',
}

const PAGE_SIZE = 12 // divisible by the 2/3/4-column grid

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ when?: string | string[]; type?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams
  const when = sp.when === 'past' ? 'past' : 'upcoming'
  const hackathonsOnly = sp.type === 'hackathons'
  const page = pageParam(sp.page)
  const href = (w: string, h: boolean) => { const q = new URLSearchParams(); if (w === 'past') q.set('when', 'past'); if (h) q.set('type', 'hackathons'); return q.size ? `/events?${q}` : '/events' }
  const rows = await listPublicEvents(when, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE, hackathonsOnly)
  const events = rows.slice(0, PAGE_SIZE)
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Events<span className="text-brand">.</span></>}>Hackathons, workshops and meetups for builders in the team1 community. Register on Luma; hackathons run here.</SectionHeading>
      <nav aria-label="Event time" className="flex gap-1 border-b border-line">
        {(['upcoming', 'past'] as const).map((w) => (
          <Link
            key={w}
            href={href(w, hackathonsOnly)}
            aria-current={when === w ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center border-b-2 px-4 capitalize transition-colors',
              when === w ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading',
            )}
          >
            {w}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-1 pb-1.5">
          {([false, true] as const).map((h) => (
            <Link
              key={String(h)}
              href={href(when, h)}
              aria-current={hackathonsOnly === h ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors',
                hackathonsOnly === h ? 'bg-surface-2 text-fg-heading' : 'text-fg-muted hover:text-fg-heading',
              )}
            >
              {h ? 'Hackathons' : 'All'}
            </Link>
          ))}
        </span>
      </nav>
      {events.length > 0 ? (
        <ul className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {events.map((e) => (
            <li key={e.id}><EventCard event={e} hackathon={e.hackathon?.status === 'published'} /></li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-fg-muted">
          {hackathonsOnly ? `No ${when} hackathons${when === 'upcoming' ? ' right now - check back soon' : ' yet'}.` : when === 'upcoming' ? 'No upcoming events right now - check back soon.' : 'No past events yet.'}
        </p>
      )}
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ when: when === 'past' ? 'past' : undefined, type: hackathonsOnly ? 'hackathons' : undefined }} />
    </div>
  )
}
