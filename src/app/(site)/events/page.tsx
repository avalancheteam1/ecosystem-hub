import type { Metadata } from 'next'
import Link from 'next/link'
import { SectionHeading } from '@/components/section-heading'
import { cn } from '@/lib/utils'
import { EventCard } from './_components/event-card'
import { listPublicEvents } from './_lib/queries'

export const metadata: Metadata = {
  title: 'Events',
  description: 'Hackathons, workshops and meetups for builders in the team1 community.',
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ when?: string | string[] }> }) {
  const when = (await searchParams).when === 'past' ? 'past' : 'upcoming'
  const events = await listPublicEvents(when)
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Events<span className="text-brand">.</span></>}>Hackathons, workshops and meetups for builders in the team1 community. Register on Luma; hackathons run here.</SectionHeading>
      <nav aria-label="Event time" className="flex gap-1 border-b border-line">
        {(['upcoming', 'past'] as const).map((w) => (
          <Link
            key={w}
            href={w === 'upcoming' ? '/events' : '/events?when=past'}
            aria-current={when === w ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center border-b-2 px-4 capitalize transition-colors',
              when === w ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading',
            )}
          >
            {w}
          </Link>
        ))}
      </nav>
      {events.length > 0 ? (
        <ul className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {events.map((e) => (
            <li key={e.id}><EventCard event={e} hackathon={e.hackathon?.status === 'published'} /></li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-fg-muted">
          {when === 'upcoming' ? 'No upcoming events right now — check back soon.' : 'No past events yet.'}
        </p>
      )}
    </div>
  )
}
