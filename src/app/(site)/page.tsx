import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { EventCard } from './events/_components/event-card'
import { listPublicEvents, upcomingEventWhere } from './events/_lib/queries'
import { SectionHeading } from '@/components/section-heading'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { BUILDER_HUB_LINKS } from '@/lib/builder-hub'
import { getPortalStats } from '@/lib/member-portal'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

// Structured data for search engines / AI crawlers. type="application/ld+json" is
// data, not script, so CSP doesn't apply.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': 'https://team1.network/#org', name: 'team1', url: 'https://team1.network', logo: `${siteUrl}/icon.png` },
    { '@type': 'WebSite', name: 'team1 Ecosystem Hub', url: siteUrl, publisher: { '@id': 'https://team1.network/#org' } },
  ],
}

// The builder's path through the hub - a real sequence, in the order people go through it.
// Areas replace `soon` with a link once they ship.
const PATH = [
  { step: 'Learn', body: 'Courses and hands-on workshops, from your first contract to mainnet.' },
  { step: 'Build', body: 'Join hackathons, find a team, or pick up a public bounty.' },
  { step: 'Ship', body: 'Every project you build lands on your profile, ready to show.' },
  { step: 'Get funded', body: 'Use your projects to apply for grants and the next program.' },
]

export default async function HomePage() {
  const [user, upcoming, stats, portalStats] = await Promise.all([
    getCurrentUser(),
    listPublicEvents('upcoming', 3),
    // builders + projects counts are hidden for now (still low) - re-add prisma.user.count() and prisma.project.count({ where: { archivedAt: null } }) here to bring them back
    Promise.all([prisma.event.count({ where: { status: 'published', ...upcomingEventWhere() } }), prisma.hackathon.count({ where: { status: 'published', event: { status: 'published', ...upcomingEventWhere() } } })]),
    getPortalStats(),
  ])
  const [events, hackathons] = stats
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full bg-brand/15 blur-[120px]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

        <div className="container-page relative grid gap-16 py-20 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-36">
          <div className="lg:col-span-7">
            <h1 className="animate-fade-in-up max-w-[13ch] text-[clamp(2.75rem,7vw,5.25rem)] leading-[1.02] tracking-[-0.02em]">
              Where Avalanche builders learn, hack and ship<span className="text-brand">.</span>
            </h1>
            <p className="animate-fade-in-up mt-8 max-w-[46ch] text-lg text-fg-body [animation-delay:120ms] sm:text-xl">
              Hackathons, workshops, bounties and courses from team1 - and one builder profile for everything you make.
            </p>
            <div className="animate-fade-in-up mt-10 flex flex-col gap-3 [animation-delay:240ms] sm:flex-row sm:flex-wrap">
              {user ? (
                <Button asChild size="lg"><Link href="/dashboard">Open your dashboard</Link></Button>
              ) : (
                <Button asChild size="lg"><Link href="/sign-in">Join the Ecosystem Hub - it&apos;s free</Link></Button>
              )}
              <Button asChild size="lg" variant="outline"><a href="https://team1.network">What is team1?</a></Button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-line bg-surface-2/80 p-6 backdrop-blur-sm sm:p-8">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h2 className="text-lg">Your path on the Ecosystem Hub</h2>
                <p className="text-sm text-fg-muted">Opening step by step</p>
              </div>
              <ol className="relative mt-8 space-y-8">
                {/* the path line - draws in once on load */}
                <span aria-hidden className="path-line absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-brand via-brand/60 to-brand/10" />
                {PATH.map(({ step, body }, i) => (
                  <li key={step} className="path-step relative pl-10" style={{ animationDelay: `${400 + i * 140}ms` }}>
                    <span aria-hidden className="absolute top-1.5 left-0 grid size-[15px] place-items-center rounded-full border border-brand bg-surface-0">
                      <span className="size-[5px] rounded-full bg-brand" />
                    </span>
                    <h3 className="text-xl leading-tight">{step}</h3>
                    <p className="mt-1.5 text-fg-muted">{body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="The Ecosystem Hub in numbers" className="border-y border-line">
        <dl className="container-page grid grid-cols-2 lg:grid-cols-4 [&>div]:border-line [&>div:nth-child(n+3)]:border-t lg:[&>div:nth-child(n+3)]:border-t-0 [&>div+div]:border-l [&>div:nth-child(3)]:border-l-0 lg:[&>div:nth-child(3)]:border-l">
          {([
            // [builders, 'builders signed up'],
            // [projects, 'projects in the making'],
            [portalStats.official_chapters ?? '–', 'Team1 chapters'],
            [portalStats.countries ?? '–', 'countries'],
            [events, 'upcoming events', '/events'],
            [hackathons, 'upcoming hackathons', '/events?type=hackathons'],
          ] as const).map(([n, label, href]) => (
            <div key={label} className="relative flex flex-col-reverse items-center justify-end px-4 py-8 text-center lg:items-start lg:px-8 lg:text-left lg:first:pl-0">
              <dt className="meta mt-2">{label}</dt>
              <dd className="font-heading text-5xl font-medium tracking-[-0.03em] text-fg-heading tabular-nums">
                {/* stretched link: the whole tile is clickable, dl/dt/dd structure stays valid */}
                {href ? <Link href={href} className="transition-colors after:absolute after:inset-0 hover:text-brand">{n}</Link> : n}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {upcoming.length > 0 && (
        <section className="container-page py-20 sm:py-28">
          <SectionHeading title={<>Coming up<span className="text-brand">.</span></>}>Hackathons, workshops and meetups run by team1 chapters around the world.</SectionHeading>
          <ul className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => <li key={e.id}><EventCard event={e} hackathon={e.hackathon?.status === 'published'} /></li>)}
          </ul>
          <Link href="/events" className="group cta-row mt-12">
            See all events <ArrowUpRight className="arrow-nudge size-8 shrink-0" aria-hidden />
          </Link>
        </section>
      )}

      <section className="container-page py-20 sm:py-28">
        <SectionHeading title={<>Docs and dev tools<span className="text-brand">.</span></>}>
          Documentation, courses and developer tools live on the Avalanche Builder Hub. This hub is where you meet other builders and take part.
        </SectionHeading>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {BUILDER_HUB_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} target="_blank" rel="noreferrer" className="group flex h-full flex-col rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
                <span className="flex items-center justify-between text-xl text-fg-heading">{l.label} <ArrowUpRight className="arrow-nudge size-5 text-fg-faint" aria-hidden /></span>
                <span className="mt-2 text-fg-muted">{l.body}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
