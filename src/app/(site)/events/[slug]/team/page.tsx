import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { FilterChip } from '@/components/filter-chip'
import { SectionCard } from '@/components/section-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { countryName } from '@/lib/countries'
import { requireUser } from '@/lib/guards'
import { BUILDER_ROLES } from '@/lib/profile'
import { initials } from '@/lib/utils'
import { getMyTeamFinder, getPublicHackathon, listTeamSeekers } from '../../_lib/hackathons/queries'
import { matchesSeeker, type SeekerFilter } from '../../_lib/hackathons/team-finder'
import { getPublicEvent } from '../../_lib/queries'
import { InviteSeekerButton, LookingForm } from './team-finder-forms'

export const metadata: Metadata = { title: 'Find a team', robots: { index: false } }

const roleName = (id: string) => BUILDER_ROLES.find((r) => r.id === id)?.name ?? id

export default async function TeamFinderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SeekerFilter> }) {
  const { slug } = await params
  const sp = await searchParams
  const user = await requireUser()
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const h = await getPublicHackathon(event.id, user.id)
  if (!h) notFound()
  const back = (
    <Link href={`/events/${slug}`} className="inline-flex min-h-11 items-center gap-2 text-fg-muted hover:text-fg-heading">
      <ArrowLeft className="size-4" aria-hidden /> {event.name}
    </Link>
  )
  // Only active participants see who is looking (and are seen).
  if (!h.joined) {
    return (
      <div className="container-page max-w-2xl py-16">
        {back}
        <EmptyState className="mt-6" title="Join the hackathon first" action={<Button asChild><Link href={`/events/${slug}/join`}>Register for Hackathon</Link></Button>}>
          Find a team is for registered participants: you see who&apos;s looking, and they see you.
        </EmptyState>
      </div>
    )
  }

  const [all, mine] = await Promise.all([listTeamSeekers(h.id, user.id), getMyTeamFinder(h.id, user.id)])
  const filter: SeekerFilter = { role: sp.role || undefined, skill: sp.skill || undefined, track: sp.track && h.tracks.some((t) => t.id === sp.track) ? sp.track : undefined }
  const seekers = all.filter((s) => matchesSeeker(s, filter))
  const trackName = (id: string) => h.tracks.find((t) => t.id === id)?.name
  const skills = [...new Set(all.flatMap((s) => s.skills))].sort((a, b) => a.localeCompare(b)).slice(0, 12)
  const href = (next: SeekerFilter) => {
    const q = new URLSearchParams(Object.entries({ ...filter, ...next }).filter((e): e is [string, string] => !!e[1]))
    return q.size ? `?${q}` : '?'
  }

  return (
    <div className="container-page max-w-4xl py-10 sm:py-16">
      {back}
      <h1 className="mt-4 text-3xl sm:text-4xl">Find a team</h1>
      <p className="mt-2 max-w-[60ch] text-fg-muted">Builders in {event.name} who are looking for a team. Project owners can invite them straight from here - their email stays private.</p>

      <SectionCard className="mt-8" title={mine.seeker ? 'You’re on the list' : 'Looking for a team yourself?'} description={mine.seeker ? 'Other participants see your name, roles, skills and this note. You drop off the list once your team submits.' : 'Add yourself and project owners can invite you to their team.'}>
        <LookingForm hackathonId={h.id} tracks={h.tracks.map((t) => ({ id: t.id, name: t.name }))} initial={mine.seeker} />
      </SectionCard>

      <h2 className="mt-12 text-xl">Looking for a team <span className="text-fg-muted">({all.length})</span></h2>
      {all.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip href={href({ role: undefined })} active={!filter.role}>All roles</FilterChip>
            {BUILDER_ROLES.map((r) => <FilterChip key={r.id} href={href({ role: r.id })} active={filter.role === r.id}>{r.name}</FilterChip>)}
          </div>
          {h.tracks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip href={href({ track: undefined })} active={!filter.track}>All tracks</FilterChip>
              {h.tracks.map((t) => <FilterChip key={t.id} href={href({ track: t.id })} active={filter.track === t.id}>{t.name}</FilterChip>)}
            </div>
          )}
          {skills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip href={href({ skill: undefined })} active={!filter.skill}>Any skill</FilterChip>
              {skills.map((k) => <FilterChip key={k} href={href({ skill: k })} active={filter.skill?.toLowerCase() === k.toLowerCase()}>{k}</FilterChip>)}
            </div>
          )}
        </div>
      )}

      {seekers.length === 0 ? (
        <EmptyState className="mt-6" title={all.length ? 'Nobody matches these filters' : 'Nobody is looking yet'} action={all.length ? <Button asChild variant="outline"><Link href="?">Clear filters</Link></Button> : undefined}>
          {all.length ? 'Try fewer filters.' : 'Be the first: add yourself above, or check back later.'}
        </EmptyState>
      ) : (
        <ul className="mt-6 grid gap-4">
          {seekers.map((s) => (
            <li key={s.id} className="rounded-xl border border-line bg-surface-2 p-5">
              <div className="flex flex-wrap items-start gap-4">
                <Avatar className="size-11">
                  {s.image && <AvatarImage src={s.image} alt="" />}
                  <AvatarFallback className="bg-surface-hover text-sm">{initials(s.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-fg-heading">{s.name}</p>
                  <p className="text-sm text-fg-muted">{[s.builderRoles.map(roleName).join(', '), countryName(s.country)].filter(Boolean).join(' - ')}</p>
                  {s.note && <p className="mt-3 text-fg-body">{s.note}</p>}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.skills.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                    {s.trackIds.map((t) => trackName(t)).filter(Boolean).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                  </div>
                </div>
                {mine.projects.length > 0 && (
                  <InviteSeekerButton
                    hackathonId={h.id}
                    userId={s.id}
                    name={s.name}
                    projects={mine.projects.map((p) => ({ id: p.id, name: p.name, state: p.members.includes(s.id) ? 'member' : p.invited.includes(s.id) ? 'invited' : 'open' }))}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {mine.projects.length === 0 && seekers.length > 0 && (
        <p className="mt-6 text-sm text-fg-muted">To invite someone, <Link href="/projects/new" className="underline decoration-brand underline-offset-4">create a project</Link> first - your team is the project&apos;s members.</p>
      )}
    </div>
  )
}
