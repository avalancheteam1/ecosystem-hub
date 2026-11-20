import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { RegistrationWindow } from './registration-window'
import { registrationWindowState, submissionWindowText, judgingWindowText, publicationText } from '../../_lib/hackathons/presentation'
import { SubmissionFilters } from './submission-filters'
import { visiblePrizeAwards, prizeWinnerState, type SubmissionFilters as Filters } from '../../_lib/hackathons/feedback-rules'
import type { SubmittedMember } from '@/lib/submission-team'
import { submissionBanner } from '@/lib/submission-status'
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Event as DbEvent } from '@prisma/client'
import { ArrowUpRight, ExternalLink, Trophy } from 'lucide-react'
import type { getMySubmissions, PublicHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { advancedStageIds, pickOpenStage, placeTitle, stageState } from '@/app/(site)/events/_lib/hackathons/rules'
import { EventCover } from '@/components/event-cover'
import { Markdown } from '@/components/markdown'
import { SectionHeading } from '@/components/section-heading'
import { StageStateBadge } from '@/components/stage-state-badge'
import { Button } from '@/components/ui/button'
import { BUILDER_HUB_LINKS } from '@/lib/builder-hub'
import { formatEventRange, formatShortDate } from '@/lib/dates'
import { readLinks } from '@/lib/link-schemas'
import { cn, initials } from '@/lib/utils'
import { LeaveHackathonButton, WithdrawSubmissionButton } from './participant-buttons'

type Mine = Awaited<ReturnType<typeof getMySubmissions>>
const Dot = () => <span className="text-brand">.</span>

/** lumaUrl null = private portal event (link hidden). */
type Event = Omit<DbEvent, 'lumaUrl'> & { lumaUrl: string | null }

/** The single next step for this viewer, as a button (or a sentence when there's none). */
function nextStep(event: Event, h: PublicHackathon, signedIn: boolean, mine: Mine, now: Date): { href?: string; label: string } {
  const open = h.stages[pickOpenStage(h.stages, now, advancedStageIds(mine))]
  if (h.joined) {
    if (open) {
      const done = mine.some((m) => m.entries.some((e) => e.stageId === open.id))
      const single = h.stages.length === 1
      return { href: `/events/${event.slug}/submit`, label: done && h.allowMultipleSubmissions ? 'Submit or update a project' : done ? (single ? 'Update your submission' : `Update your ${open.name} submission`) : single ? 'Submit your project' : `Submit to ${open.name}` }
    }
    if (h.stages.some((s) => stageState(s, now) === 'upcoming')) return { label: 'You’re in. Submissions open with the next stage.' }
    return { label: h.resultsPublishedAt ? 'The hackathon is over - see the winners below.' : 'Submissions are closed. Results are coming.' }
  }
  if (h.registration === 'pending') return { label: 'Registration received - the organisers will review it. We’ll email you once you’re in.' }
  if (h.registration === 'rejected') return { label: 'Your registration wasn’t accepted.' }
  const registrationState = registrationWindowState(h, now)
  if (registrationState === 'upcoming') return { label: 'Registration has not opened yet.' }
  if (registrationState === 'closed') return { label: 'Registration is closed.' }
  if (h.maxParticipants != null && h._count.participants >= h.maxParticipants) return { label: 'This hackathon is full.' }
  return { href: signedIn ? `/events/${event.slug}/join` : `/sign-in?next=/events/${event.slug}/join`, label: 'Register for Hackathon' }
}

export function HackathonView({ event, h, signedIn, mine, share, manage, filters = {} }: { filters?: Filters; event: Event; h: PublicHackathon; signedIn: boolean; mine: Mine; share: ReactNode; manage?: ReactNode }) {
  const now = new Date()
  const step = nextStep(event, h, signedIn, mine, now)
  const resultPrizes = h.prizes
  const results = resultPrizes.flatMap((p) => visiblePrizeAwards(p, filters).map((a) => ({ p, a })))
  // ponytail: a place without an amount is just a ranking slot for awards - not advertised as a prize
  const listed = h.prizes.filter((p) => p.amount && !p.sponsorPrizeId)
  const overall = listed.filter((p) => !p.trackId)
  const sections = [
    ['about', 'About', true],
    ['tracks', 'Tracks', h.tracks.length > 0],
    ['sponsor-prizes', 'Sponsor prizes', h.sponsorPrizes.length > 0],
    ['prizes', 'Prizes', overall.length > 0 || !!h.prizePool],
    ['timeline', 'Timeline', h.stages.length > 0],
    ['rules', 'Rules', !!h.rulesMd],
    ['results', 'Winners', h.prizes.length > 0],
  ].filter(([, , show]) => show) as [string, string][]
  // Upcoming deadline = close of the open stage, else of the next one.
  const deadline = h.stages.find((s) => stageState(s, now) === 'open') ?? h.stages.find((s) => stageState(s, now) === 'upcoming')
  const facts = [
    ...(h.prizePool ? [[h.prizePool, 'prize pool']] : []),
    ...(deadline ? [[formatShortDate(deadline.closesAt, h.timezone), h.stages.length > 1 ? `${deadline.name} closes` : 'submissions close']] : []),
    [teamSize(h), 'people per team'],
    ...(h.tracks.length ? [[h.tracks.length, h.tracks.length === 1 ? 'track' : 'tracks']] : []),
    [h.stages.length, h.stages.length === 1 ? 'round' : 'rounds'],
  ].slice(0, 4)
  // The organiser's own links, then the default Avalanche ones in their own block (unless hidden).
  const linkGroups = ([
    ['Build with', readLinks(h.resourceLinks)],
    ['Avalanche Builder Hub', h.showBuilderHubLinks ? BUILDER_HUB_LINKS.map((l) => ({ label: l.label, url: l.href })) : []],
  ] as const).filter(([, links]) => links.length > 0)
  // Mirrors withdrawSubmission: allowed until the last stage's judging is closed.
  const last = h.stages.at(-1)
  const withdrawable = !last || stageState(last, now) !== 'closed'
  const location = event.isOnline ? 'Online' : [event.city, event.country].filter(Boolean).join(', ')

  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-48 right-[-15%] h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-[120px]" />
        {manage}
        <div className="container-page relative grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,380px)_1fr] lg:items-end lg:gap-16">
          <div className="relative max-w-[380px] before:pointer-events-none before:absolute before:-top-3 before:-left-3 before:size-8 before:border-t before:border-l before:border-brand">
            <EventCover src={event.coverUrl} />
          </div>
          <div className="min-w-0">
            <p className="meta inline-flex items-center gap-2"><Trophy className="size-3.5 text-brand" aria-hidden /> Hackathon - {formatEventRange(event.startAt, event.endAt, event.timezone)}</p>
            <h1 className="mt-4 text-4xl leading-[1.02] tracking-[-0.015em] sm:text-6xl">{event.name}</h1>
            {h.tagline && <p className="mt-5 max-w-[52ch] text-xl text-fg-body">{h.tagline}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              {step.href ? <Button asChild size="lg"><Link href={step.href}>{step.label}</Link></Button> : <p className="text-fg-body">{step.label}</p>}
              {share}
              {h.joined && !mine.length && !h.resultsPublishedAt && <LeaveHackathonButton hackathonId={h.id} />}
              {event.lumaUrl && (
                <a href={event.lumaUrl} target="_blank" rel="noreferrer" className="group inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted hover:text-fg-heading">
                  Event page on Luma <ArrowUpRight className="arrow-nudge size-3.5" aria-hidden />
                </a>
              )}
            </div>
          </div>
        </div>
        <dl className="container-page grid grid-cols-2 border-t border-line lg:grid-cols-4">
          {facts.map(([n, label], i) => (
            <div key={label as string} className={cn('flex flex-col-reverse justify-end py-6', i % 2 === 1 && 'border-l border-line pl-6', i >= 2 && 'border-t border-line lg:border-t-0', i === 2 && 'lg:border-l lg:pl-6', i === 3 && 'lg:pl-6')}>
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
        {mine.map((mine) => (
          <section key={mine.id} aria-label={`Your submission: ${mine.project.currentVersion?.name}`} className="border-y border-line py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-xl">Your team: {mine.project.currentVersion?.name}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {mine.status === 'active' && withdrawable && <WithdrawSubmissionButton submissionId={mine.id} name={mine.project.currentVersion?.name ?? 'this project'} />}
                <Link href={`/projects/${mine.project.slug}`} className="group inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg-heading">Open project <ArrowUpRight className="arrow-nudge size-3.5" aria-hidden /></Link>
              </div>
            </div>
            <ol className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {h.stages.map((s) => {
                const e = mine.entries.find((x) => x.stageId === s.id)
                return (
                  <li key={s.id} className="bg-background p-4">
                    <p className="meta">{s.name}</p>
                    <p className="mt-1 text-fg-heading">{submissionBanner(mine.status, e?.submittedAt ?? null, h.timezone)}</p>
                    {e && <p className="mt-2 text-sm text-fg-muted">Submitted team: {(e.teamSnapshot as SubmittedMember[]).map((m) => m.name).join(', ')}</p>}
                    {e?.advancedAt && <p className="mt-1 text-sm text-success">Advanced to the next stage</p>}
                  </li>
                )
              })}
            </ol>
          </section>
        ))}

        {h.prizes.length > 0 && (
          <section id="results">
            <SectionHeading title={<>Winners<Dot /></>}>Overall, track and sponsor winners are announced independently.</SectionHeading>
            <SubmissionFilters tracks={h.tracks} sponsorPrizes={h.sponsorPrizes} value={filters} />
            {(filters.track || filters.sponsor) && results.length === 0 && <p className="mb-4 text-sm text-fg-muted">No published winners match these filters. Pending prizes are listed below.</p>}
            <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
              {resultPrizes.filter((p) => prizeWinnerState(p.publishedAt, p.awards.length) !== 'published').map((p) => <li key={p.id} className="border-b border-line px-6 py-8"><p className="meta">{p.sponsorPrizeId ? h.sponsorPrizes.find((sp) => sp.id === p.sponsorPrizeId)?.sponsor : p.trackId ? h.tracks.find((t) => t.id === p.trackId)?.name : 'Overall'} · {p.title}</p><p className="mt-3 text-xl text-fg-muted">Winner to be announced</p><p className="mt-2 text-sm text-fg-muted">{publicationText(null, h.timezone)}</p></li>)}
              {results.map(({ p, a }, i) => (
                <li key={a.id} className={cn('wash border-b border-line px-6 py-8 sm:px-8', i % 2 === 1 && 'sm:border-l', i % 2 === 1 && i % 3 === 0 && 'lg:border-l-0', i % 3 !== 0 && 'lg:border-l')}>
                  <p className="meta text-brand">{p.sponsorPrizeId ? `${h.sponsorPrizes.find((sp) => sp.id === p.sponsorPrizeId)?.sponsor}: ` : ''}{p.title}{p.placementTo ? ` - ${placeTitle(a.placement)}` : ''}{p.trackId ? ` - ${h.tracks.find((t) => t.id === p.trackId)?.name}` : ''}</p>
                  <div className="mt-3 flex items-center gap-3"><Avatar className="size-12 rounded-lg"><AvatarImage className="object-cover" src={a.submission.entries[0]!.projectVersion.logoUrl ?? a.submission.entries[0]!.projectVersion.coverUrl ?? undefined} alt="" /><AvatarFallback className="rounded-lg">{initials(a.submission.entries[0]!.projectVersion.name)}</AvatarFallback></Avatar><p className="min-w-0 break-words font-heading text-3xl tracking-[-0.02em] text-fg-heading">{a.submission.entries[0]!.projectVersion.name}</p></div>
                  <p className="mt-2 text-sm text-fg-muted">{publicationText(p.publishedAt, h.timezone)}</p>
                  <p className="mt-2 text-fg-muted">{a.submission.entries[0]!.projectVersion.shortDescription}</p>
                  {p.amount && <p className="meta mt-5">{p.amount}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Registration checklist" className="rounded-xl border border-line bg-surface-2 p-6"><h2 className="text-xl">Register and submit as a team</h2><ol className="mt-4 list-decimal space-y-3 pl-5 text-fg-body"><li>Every team member registers.</li><li>One member creates the team and invites the others. <Link href={`/events/${event.slug}/submit#team-invitations`} className="inline-flex min-h-11 items-center underline">Invite teammates by email</Link></li><li>That member submits for the team.</li></ol><p className="mt-4 text-sm text-fg-muted">Creating a project does not submit it. Accept team invitations and check that every joined teammate is registered for this hackathon.</p></section>
        <section id="about" className="grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-20">
          <div>
            <h2 className="mb-8 text-[clamp(2rem,4vw,3.5rem)] leading-[1.05]">About<Dot /></h2>
            {h.aboutMd ? <Markdown>{h.aboutMd}</Markdown> : <p className="text-fg-muted">Details coming soon.</p>}
          </div>
          <aside className="self-start border-t border-line lg:sticky lg:top-36">
            <dl className="divide-y divide-line text-sm">
              {location && <div className="flex justify-between gap-4 py-3"><dt className="meta">Location</dt><dd className="text-right text-fg-heading">{location}</dd></div>}
              <div className="flex justify-between gap-4 py-3"><dt className="meta">Teams</dt><dd className="text-fg-heading">{teamSize(h)} people</dd></div>
              <div className="py-3"><dt className="sr-only">Registration window</dt><dd><RegistrationWindow hackathon={h} now={now} /></dd></div>
              {h.maxParticipants && <div className="flex justify-between gap-4 py-3"><dt className="meta">Spots</dt><dd className="text-fg-heading">{Math.max(h.maxParticipants - h._count.participants, 0)} of {h.maxParticipants} left</dd></div>}
              {h.termsUrl && <div className="py-3"><a href={h.termsUrl} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1.5 text-fg-body hover:text-fg-heading">Terms <ExternalLink className="size-3.5" aria-hidden /></a></div>}
            </dl>
            {linkGroups.map(([title, links]) => (
              <div key={title}>
                <p className="meta mt-8 border-t border-line pt-3">{title}</p>
                <ul className="mt-1 text-sm">
                  {links.map((l) => (
                    <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer" className="group inline-flex min-h-9 items-center gap-1.5 text-fg-body hover:text-fg-heading">{l.label} <ArrowUpRight className="arrow-nudge size-3.5 text-fg-faint" aria-hidden /></a></li>
                  ))}
                </ul>
              </div>
            ))}
          </aside>
        </section>

        <p className="text-fg-muted">{h.tracks.length} tracks · {h.sponsorPrizes.length} sponsor prizes</p>
        {h.sponsorPrizes.length > 0 && <section id="sponsor-prizes"><SectionHeading title="Sponsor prizes / technologies">Pick the prizes you compete for separately from tracks.</SectionHeading><ul className="grid gap-4 sm:grid-cols-2">{h.sponsorPrizes.map((p) => <li key={p.id} className="rounded-xl border border-line p-6"><h3 className="text-xl">{p.name}</h3><p className="text-sm text-fg-muted">{p.sponsor}</p>{p.description && <p className="mt-3 text-fg-body">{p.description}</p>}{p.eligibilityHint && <p className="mt-3 text-sm text-fg-muted">Eligibility: {p.eligibilityHint}</p>}</li>)}</ul></section>}
        {h.tracks.length > 0 && (
          <section id="tracks">
            <SectionHeading title={<>Tracks<Dot /></>}>Enter any number, or choose no track / free project. Each track is judged on its own and can carry its own prizes.</SectionHeading>
            <ul className="grid border-t border-line md:grid-cols-2">
              {h.tracks.map((t, i) => {
                const prizes = listed.filter((p) => p.trackId === t.id)
                return (
                  <li key={t.id} className={cn('flex flex-col border-b border-line py-8', i % 2 === 1 ? 'md:border-l md:pl-10' : 'md:pr-10')}>
                    <div className="flex items-center gap-4">
                      {t.sponsorLogoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
                        <img src={t.sponsorLogoUrl} alt={t.sponsor ?? ''} className="size-12 shrink-0 rounded-lg border border-line object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="meta">Track {String(i + 1).padStart(2, '0')}{t.sponsor ? ` - by ${t.sponsor}` : ''}</p>
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
                  <p className="meta mt-2">{p.title}{p.description ? ` - ${p.description}` : ''}</p>
                  <p className="font-heading text-[clamp(1.75rem,3.5vw,3rem)] font-medium leading-none tracking-[-0.03em] text-fg-heading">{p.amount}</p>
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
                  <li key={s.id} className={cn('grid gap-4 border-b border-line px-4 py-8 sm:grid-cols-[72px_220px_1fr] sm:gap-8', state === 'open' && 'wash')}>
                    <p className={cn('font-heading text-5xl leading-none tabular-nums', state === 'open' ? 'text-brand' : 'text-fg-faint')}>{String(i + 1).padStart(2, '0')}</p>
                    <div>
                      <h3 className="text-xl">{s.name}</h3>
                      <p className="meta mt-2">{submissionWindowText(s, h.timezone)}</p>
                      <div className="mt-3"><StageStateBadge state={state} /></div>
                      <p className="mt-3 text-sm text-fg-muted">{judgingWindowText(s, h.timezone)}</p>
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

function teamSize(h: { teamSizeMin: number; teamSizeMax: number | null }) {
  if (h.teamSizeMax == null) return `${h.teamSizeMin}+`
  return h.teamSizeMin === h.teamSizeMax ? h.teamSizeMin : `${h.teamSizeMin}–${h.teamSizeMax}`
}
