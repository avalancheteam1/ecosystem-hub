import Link from 'next/link'
import type { Event } from '@prisma/client'
import { ArrowUpRight, ExternalLink, Trophy } from 'lucide-react'
import type { getMySubmission, PublicHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { stageState } from '@/app/(site)/events/_lib/hackathons/rules'
import { EventCover } from '@/components/event-cover'
import { Markdown } from '@/components/markdown'
import { SectionHeading } from '@/components/section-heading'
import { StageStateBadge } from '@/components/stage-state-badge'
import { Button } from '@/components/ui/button'
import { formatEventRange, formatShortDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

type Mine = Awaited<ReturnType<typeof getMySubmission>>
const Dot = () => <span className="text-brand">.</span>

/** The single next step for this viewer, as a button (or a sentence when there's none). */
function nextStep(event: Event, h: PublicHackathon, signedIn: boolean, mine: Mine, now: Date): { href?: string; label: string } {
  const open = h.stages.find((s) => stageState(s, now) === 'open')
  if (!signedIn) return { href: `/sign-in?next=/events/${event.slug}/join`, label: 'Sign in to join' }
  if (h.joined) {
    if (open) {
      const done = mine?.entries.some((e) => e.stageId === open.id)
      const single = h.stages.length === 1
      return { href: `/events/${event.slug}/submit`, label: done ? (single ? 'Update your submission' : `Update your ${open.name} submission`) : single ? 'Submit your project' : `Submit to ${open.name}` }
    }
    if (h.stages.some((s) => stageState(s, now) === 'upcoming')) return { label: 'You’re in. Submissions open with the next stage.' }
    return { label: h.resultsPublishedAt ? 'The hackathon is over — see the winners below.' : 'Submissions are closed. Results are coming.' }
  }
  if (h.registrationClosesAt && now >= h.registrationClosesAt) return { label: 'Registration is closed.' }
  if (h.maxParticipants != null && h._count.participants >= h.maxParticipants) return { label: 'This hackathon is full.' }
  return { href: `/events/${event.slug}/join`, label: 'Join the hackathon' }
}

export function HackathonView({ event, h, signedIn, mine }: { event: Event; h: PublicHackathon; signedIn: boolean; mine: Mine }) {
  const now = new Date()
  const step = nextStep(event, h, signedIn, mine, now)
  const results = h.resultsPublishedAt ? h.prizes.filter((p) => p.award && p.award.submission.status === 'active' && p.award.submission.entries[0]) : []
  const overall = h.prizes.filter((p) => !p.trackId)
  const sections = [
    ['about', 'About', true],
    ['tracks', 'Tracks', h.tracks.length > 0],
    ['prizes', 'Prizes', overall.length > 0 || !!h.prizePool],
    ['timeline', 'Timeline', h.stages.length > 0],
    ['rules', 'Rules', !!h.rulesMd],
    ['results', 'Winners', results.length > 0],
  ].filter(([, , show]) => show) as [string, string][]
  // Upcoming deadline = close of the open stage, else of the next one.
  const deadline = h.stages.find((s) => stageState(s, now) === 'open') ?? h.stages.find((s) => stageState(s, now) === 'upcoming')
  const facts = [
    ...(h.prizePool ? [[h.prizePool, 'prize pool']] : []),
    ...(deadline ? [[formatShortDate(deadline.closesAt, h.timezone), h.stages.length > 1 ? `${deadline.name} closes` : 'submissions close']] : []),
    [h.teamSizeMin === h.teamSizeMax ? h.teamSizeMin : `${h.teamSizeMin}–${h.teamSizeMax}`, 'people per team'],
    ...(h.tracks.length ? [[h.tracks.length, h.tracks.length === 1 ? 'track' : 'tracks']] : []),
    [h.stages.length, h.stages.length === 1 ? 'round' : 'rounds'],
  ].slice(0, 4)

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-48 right-[-15%] h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-[120px]" />
        <div className="container-page relative grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-end lg:gap-16">
          <div className="relative max-w-[380px] before:pointer-events-none before:absolute before:-top-3 before:-left-3 before:size-8 before:border-t before:border-l before:border-brand">
            <EventCover src={event.coverUrl} />
          </div>
          <div className="min-w-0">
            <p className="meta inline-flex items-center gap-2"><Trophy className="size-3.5 text-brand" aria-hidden /> Hackathon — {formatEventRange(event.startAt, event.endAt, event.timezone)}</p>
            <h1 className="mt-4 text-4xl leading-[1.02] tracking-[-0.015em] sm:text-6xl">{event.name}</h1>
            {h.tagline && <p className="mt-5 max-w-[52ch] text-xl text-fg-body">{h.tagline}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              {step.href ? <Button asChild size="lg"><Link href={step.href}>{step.label}</Link></Button> : <p className="text-fg-body">{step.label}</p>}
              <a href={event.lumaUrl} target="_blank" rel="noreferrer" className="group inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-fg-heading">
                {event.isOnline ? 'Online' : [event.city, event.country].filter(Boolean).join(', ')} — event page on Luma <ArrowUpRight className="arrow-nudge size-3.5" aria-hidden />
              </a>
            </div>
          </div>
        </div>
        <dl className="container-page grid grid-cols-2 border-t border-line lg:grid-cols-4">
          {facts.map(([n, label], i) => (
            <div key={label as string} className={cn('flex flex-col-reverse py-6', i % 2 === 1 && 'border-l border-line pl-6', i >= 2 && 'border-t border-line lg:border-t-0', i === 2 && 'lg:border-l lg:pl-6', i === 3 && 'lg:pl-6')}>
              <dt className="meta mt-1">{label}</dt>
              <dd className="font-heading text-4xl font-medium tracking-[-0.03em] text-fg-heading tabular-nums">{n}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="Sections" className="sticky top-16 z-30 border-y border-line bg-surface-0/90 backdrop-blur-md">
        <ul className="no-scrollbar container-page flex gap-1 overflow-x-auto overflow-y-hidden">
          {sections.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="inline-flex min-h-12 items-center px-3 text-sm whitespace-nowrap text-fg-muted transition-colors first:pl-0 hover:text-fg-heading">{label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="container-page space-y-24 py-16 sm:py-24 [&>section]:scroll-mt-32">
        {mine && (
          <section aria-label="Your submission" className="border-y border-line py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl">Your team: {mine.project.currentVersion?.name}</h2>
              <Link href={`/projects/${mine.project.slug}`} className="group inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-heading">Open project <ArrowUpRight className="arrow-nudge size-3.5" aria-hidden /></Link>
            </div>
            <ol className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {h.stages.map((s) => {
                const e = mine.entries.find((x) => x.stageId === s.id)
                return (
                  <li key={s.id} className="bg-background p-4">
                    <p className="meta">{s.name}</p>
                    <p className="mt-1 text-fg-heading">{e ? `Submitted version ${e.projectVersion.number}` : 'Not submitted'}</p>
                    {e?.advancedAt && <p className="mt-1 text-sm text-success">Advanced to the next stage</p>}
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {results.length > 0 && (
          <section id="results">
            <SectionHeading title={<>Winners<Dot /></>}>Picked by the judges across {h.stages.length} {h.stages.length === 1 ? 'round' : 'rounds'}.</SectionHeading>
            <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {results.map((p, i) => (
                <li key={p.id} className={cn('wash border-b border-line py-8 sm:pr-8', i % 3 !== 0 && 'lg:border-l lg:pl-8', i % 2 === 1 && 'sm:border-l sm:pl-8 lg:border-l-0 lg:pl-0', i % 3 !== 0 && 'lg:border-l lg:pl-8')}>
                  <p className="meta text-brand">{p.title}{p.trackId ? ` — ${h.tracks.find((t) => t.id === p.trackId)?.name}` : ''}</p>
                  <p className="mt-3 font-heading text-3xl tracking-[-0.02em] text-fg-heading">{p.award!.submission.entries[0]!.projectVersion.name}</p>
                  <p className="mt-2 text-fg-muted">{p.award!.submission.entries[0]!.projectVersion.shortDescription}</p>
                  {p.amount && <p className="meta mt-5">{p.amount}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="about" className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-20">
          <div>
            <h2 className="mb-8 text-[clamp(2rem,4vw,3.5rem)] leading-[1.05]">About<Dot /></h2>
            {h.aboutMd ? <Markdown>{h.aboutMd}</Markdown> : <p className="text-fg-muted">Details coming soon.</p>}
          </div>
          <aside className="self-start border-t border-line lg:sticky lg:top-36">
            <dl className="divide-y divide-line text-sm">
              <div className="flex justify-between gap-4 py-3"><dt className="meta">Teams</dt><dd className="text-fg-heading">{h.teamSizeMin === h.teamSizeMax ? h.teamSizeMin : `${h.teamSizeMin}–${h.teamSizeMax}`} people</dd></div>
              {h.registrationClosesAt && <div className="flex justify-between gap-4 py-3"><dt className="meta">Join until</dt><dd className="text-right text-fg-heading">{formatEventRange(h.registrationClosesAt, null, h.timezone)}</dd></div>}
              {h.maxParticipants && <div className="flex justify-between gap-4 py-3"><dt className="meta">Spots</dt><dd className="text-fg-heading">{Math.max(h.maxParticipants - h._count.participants, 0)} of {h.maxParticipants} left</dd></div>}
              {h.termsUrl && <div className="py-3"><a href={h.termsUrl} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 text-fg-body hover:text-fg-heading">Terms <ExternalLink className="size-3.5" aria-hidden /></a></div>}
            </dl>
          </aside>
        </section>

        {h.tracks.length > 0 && (
          <section id="tracks">
            <SectionHeading title={<>Tracks<Dot /></>}>Enter one or more. Each track is judged on its own and can carry its own prizes.</SectionHeading>
            <ul className="grid border-t border-line md:grid-cols-2">
              {h.tracks.map((t, i) => {
                const prizes = h.prizes.filter((p) => p.trackId === t.id)
                return (
                  <li key={t.id} className={cn('flex flex-col border-b border-line py-8', i % 2 === 1 ? 'md:border-l md:pl-10' : 'md:pr-10')}>
                    <div className="flex items-center gap-4">
                      {t.sponsorLogoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
                        <img src={t.sponsorLogoUrl} alt={t.sponsor ?? ''} className="size-12 shrink-0 rounded-lg border border-line object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="meta">Track {String(i + 1).padStart(2, '0')}{t.sponsor ? ` — by ${t.sponsor}` : ''}</p>
                        <h3 className="mt-1 text-2xl">{t.name}</h3>
                      </div>
                    </div>
                    {t.descriptionMd && <Markdown className="mt-5 text-sm">{t.descriptionMd}</Markdown>}
                    {prizes.length > 0 && (
                      <ul className="mt-6 space-y-1.5 text-sm">
                        {prizes.map((p) => <li key={p.id} className="flex justify-between gap-4"><span className="text-fg-muted">{p.title}</span><span className="font-heading text-fg-heading">{p.amount}</span></li>)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(overall.length > 0 || h.prizePool) && (
          <section id="prizes">
            <SectionHeading title={<>Prizes<Dot /></>}>Awarded after the final round.</SectionHeading>
            {h.prizePool && (
              <p className={cn('flex flex-col-reverse border-t border-line py-8', overall.length === 0 && 'border-b')}>
                <span className="meta mt-2">total prize pool</span>
                <span className="font-heading text-[clamp(3rem,7vw,6rem)] font-medium leading-none tracking-[-0.04em] text-fg-heading">{h.prizePool}</span>
              </p>
            )}
            {overall.length > 0 && <ul className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
              {overall.map((p, i) => (
                <li key={p.id} className={cn('flex flex-col-reverse border-b border-line py-8', i % 2 === 1 && 'border-l pl-6', i % 4 !== 0 && 'lg:border-l lg:pl-6', i % 4 === 2 && 'lg:border-l')}>
                  <p className="meta mt-2">{p.title}{p.description ? ` — ${p.description}` : ''}</p>
                  <p className="font-heading text-[clamp(1.75rem,3.5vw,3rem)] font-medium leading-none tracking-[-0.03em] text-fg-heading">{p.amount ?? '—'}</p>
                </li>
              ))}
            </ul>}
          </section>
        )}

        {h.stages.length > 0 && (
          <section id="timeline">
            <SectionHeading title={<>Timeline<Dot /></>}>Every round has its own window and judging. Only teams advanced from a round can enter the next.</SectionHeading>
            <ol className="border-t border-line">
              {h.stages.map((s, i) => {
                const state = stageState(s, now)
                const total = s.criteria.reduce((a, x) => a + x.weight, 0)
                return (
                  <li key={s.id} className={cn('grid gap-4 border-b border-line py-8 sm:grid-cols-[72px_220px_1fr] sm:gap-8', state === 'open' && 'wash')}>
                    <p className={cn('font-heading text-5xl leading-none tabular-nums', state === 'open' ? 'text-brand' : 'text-fg-faint')}>{String(i + 1).padStart(2, '0')}</p>
                    <div>
                      <h3 className="text-xl">{s.name}</h3>
                      <p className="meta mt-2">{formatEventRange(s.opensAt, s.closesAt, h.timezone)}</p>
                      <div className="mt-3"><StageStateBadge state={state} /></div>
                    </div>
                    <div className="min-w-0 space-y-5">
                      {s.descriptionMd && <Markdown>{s.descriptionMd}</Markdown>}
                      {s.showCriteria && s.criteria.length > 0 && (
                        <ul className="max-w-xl space-y-2" aria-label={`How ${s.name} is judged`}>
                          {s.criteria.map((c) => {
                            const pct = Math.round((c.weight / total) * 100)
                            return (
                              <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
                                <span className="text-fg-body">{c.name}</span>
                                <span className="meta tabular-nums">{pct}%</span>
                                <span className="col-span-2 h-px bg-line"><span className="block h-px bg-brand" style={{ width: `${pct}%` }} /></span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {h.rulesMd && (
          <section id="rules" className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-20">
            <div>
              <h2 className="mb-8 text-[clamp(2rem,4vw,3.5rem)] leading-[1.05]">Rules<Dot /></h2>
              <Markdown>{h.rulesMd}</Markdown>
            </div>
          </section>
        )}

        {step.href && (
          <Link href={step.href} className="group cta-row">
            {step.label} <ArrowUpRight className="arrow-nudge size-8 shrink-0" aria-hidden />
          </Link>
        )}
      </div>
    </>
  )
}
