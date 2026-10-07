import Link from 'next/link'
import { getCurrentUser } from '@/lib/session'
import { Button } from '@/components/ui/button'

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

// The builder's path through the hub — a real sequence, in the order people go through it.
// Areas replace `soon` with a link once they ship.
const PATH = [
  { step: 'Learn', body: 'Courses and hands-on workshops, from your first contract to mainnet.' },
  { step: 'Build', body: 'Join hackathons, find a team, or pick up a public bounty.' },
  { step: 'Ship', body: 'Every project you build lands on your profile, ready to show.' },
  { step: 'Get funded', body: 'Use your projects to apply for grants and the next program.' },
]

export default async function HomePage() {
  const user = await getCurrentUser()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full bg-brand/15 blur-[120px]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

        <div className="container-page relative grid gap-16 py-20 sm:py-28 lg:grid-cols-12 lg:items-center lg:gap-10 lg:py-36">
          <div className="lg:col-span-7">
            <h1 className="animate-fade-in-up max-w-[13ch] text-[clamp(2.75rem,7vw,5.25rem)] leading-[1.02] tracking-[-0.02em]">
              Where Avalanche builders learn, hack and ship.
            </h1>
            <p className="animate-fade-in-up mt-8 max-w-[46ch] text-lg text-fg-body [animation-delay:120ms] sm:text-xl">
              Hackathons, workshops, bounties and courses from team1 — and one builder profile for everything you make.
            </p>
            <div className="animate-fade-in-up mt-10 flex flex-wrap gap-3 [animation-delay:240ms]">
              {user ? (
                <Button asChild size="lg"><Link href="/dashboard">Open your dashboard</Link></Button>
              ) : (
                <Button asChild size="lg"><Link href="/sign-in">Create your builder account</Link></Button>
              )}
              <Button asChild size="lg" variant="outline"><a href="https://team1.network">What is team1?</a></Button>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-line bg-surface-2/80 p-6 backdrop-blur-sm sm:p-8">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <h2 className="text-lg">Your path on the hub</h2>
                <p className="text-sm text-fg-muted">Opening step by step</p>
              </div>
              <ol className="relative mt-8 space-y-8">
                {/* the path line — draws in once on load */}
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
    </>
  )
}
