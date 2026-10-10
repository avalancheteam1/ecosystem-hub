import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, BookOpen, CalendarDays, Coins, FolderGit2, GraduationCap, Megaphone, Trophy, Users, type LucideIcon } from 'lucide-react'
import { EventCover } from '@/components/event-cover'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { ProjectGrid } from '@/app/(app)/projects/_components/project-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { countryName } from '@/lib/countries'
import { formatRelative, formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { BUILDER_HUB_URL } from '@/lib/builder-hub'
import { requireUser } from '@/lib/guards'
import { BUILDER_ROLES, hasCompleteBasicProfile } from '@/lib/profile'
import { cn, initials } from '@/lib/utils'
import { getUserGroups } from '@/lib/user-groups'
import { byActivity, byUrgency, hackathonMoment, type HackathonMoment } from './_lib/highlights'
import { startSteps } from './_lib/start'

const STEP_ICON = { events: CalendarDays, project: FolderGit2, learn: GraduationCap, grants: Coins, team1: Users, invite: Megaphone } as Record<string, LucideIcon>

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser()
  const welcome = (await searchParams).welcome === '1'
  const [u, allProjects, hackathons, onboardings, { groups }] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true, image: true } }),
    prisma.project.findMany({
      where: { archivedAt: null, members: { some: { userId: user.id } } },
      select: {
        id: true,
        slug: true,
        currentVersion: { select: { name: true, logoUrl: true, maturity: true, updatedAt: true, fullDescription: true, techDescription: true, techStack: true, githubRepos: true, demoLinks: true } },
        milestones: { where: { status: { in: ['planned', 'in_progress'] } }, orderBy: { targetDate: 'asc' }, take: 1, select: { title: true, targetDate: true } },
      },
    }),
    prisma.participant.findMany({
      where: { userId: user.id, status: { in: ['active', 'pending'] } },
      select: {
        id: true,
        status: true,
        hackathon: {
          select: {
            resultsPublishedAt: true,
            timezone: true,
            event: { select: { name: true, slug: true, coverUrl: true, startAt: true } },
            stages: { orderBy: { order: 'asc' }, select: { id: true, name: true, opensAt: true, closesAt: true, judgingClosedAt: true } },
            submissions: { where: { status: 'active', project: { members: { some: { userId: user.id } } } }, select: { entries: { select: { stageId: true } } } },
          },
        },
      },
    }),
    prisma.referral.count({ where: { referrerId: user.id } }),
    getUserGroups(user.id),
  ])
  // ponytail: sorts all of the user's projects in memory - fine for a handful, paginate if builders get dozens
  const projects = allProjects.filter((p) => p.currentVersion).sort((a, b) => byActivity(a.currentVersion!, b.currentVersion!)).slice(0, 6)
  // Nothing joined or created yet: lead with next steps instead of empty lists.
  const fresh = projects.length === 0 && hackathons.length === 0
  const leadGroups = groups.filter((g) => g.lead)
  const now = new Date()
  const nextUp = hackathons
    .flatMap((p) => {
      const h = p.hackathon
      const moment = hackathonMoment(h.stages, h.resultsPublishedAt, h.event.startAt, new Set(h.submissions.flatMap((s) => s.entries.map((e) => e.stageId))), now)
      return moment ? [{ ...moment, id: p.id, pending: p.status === 'pending', event: h.event, timezone: h.timezone }] : []
    })
    .sort(byUrgency)
  const first = u.name.split(' ')[0]
  const meta = [countryName(u.country), u.builderRoles.map((r) => BUILDER_ROLES.find((x) => x.id === r)?.name).join(', ')].filter(Boolean)
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar className="size-16 border border-line max-sm:hidden">
          {u.image && <AvatarImage src={u.image} alt="" />}
          <AvatarFallback className="bg-surface-hover text-lg">{initials(u.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className={cn('text-3xl sm:text-4xl', !welcome && 'truncate')}>{welcome ? <>Welcome to team1, {first}<span className="text-brand">.</span></> : `Hi, ${first}`}</h1>
          <p className={cn('mt-1 text-fg-muted', !welcome && 'truncate')}>{welcome ? 'You’re in. Glad to have you - here’s where to start.' : meta.length ? meta.join(' - ') : user.email}</p>
        </div>
        <Button asChild variant="outline"><Link href="/profile">Edit profile</Link></Button>
      </header>

      {!hasCompleteBasicProfile(u) && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          Add your country and roles to your <Link href="/profile" className="underline decoration-brand underline-offset-2">profile</Link> - you need them to join hackathons.
        </p>
      )}

      {fresh && (
        <section aria-labelledby="start-here">
          <h2 id="start-here" className="text-xl">Start here</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {startSteps(u.builderRoles).map((s, i) => {
              const Icon = STEP_ICON[s.id] ?? Trophy
              const cls = 'group flex h-full flex-col rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow'
              const body = (
                <>
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-1 text-brand"><Icon className="size-5" aria-hidden /></span>
                    <ArrowUpRight className="arrow-nudge size-5 text-fg-faint" aria-hidden />
                  </span>
                  <span className="mt-5 text-lg text-fg-heading">{s.title}</span>
                  <span className="mt-1.5 text-sm text-fg-muted">{s.body}</span>
                </>
              )
              return (
                <li key={s.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                  {s.external ? <a href={s.href} target="_blank" rel="noopener noreferrer" className={cls}>{body}</a> : <Link href={s.href} className={cls}>{body}</Link>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {nextUp.length > 0 && (
        <section aria-labelledby="next-up">
          <h2 id="next-up" className="text-xl">Next up</h2>
          <ul className="mt-5 grid gap-5 lg:grid-cols-2">
            {nextUp.map((h, i) => (
              <li key={h.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                <HackathonCard h={h} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!fresh && (
        <section aria-labelledby="your-projects">
          <div className="flex items-center justify-between gap-3">
            <h2 id="your-projects" className="text-xl">Your projects</h2>
            {projects.length > 0 && <Button asChild size="sm" variant="ghost"><Link href="/projects">All projects</Link></Button>}
          </div>
          <div className="mt-5"><ProjectGrid projects={projects} now={now} /></div>
        </section>
      )}

      {!fresh && <ReferralsCard onboardings={onboardings} leadGroups={leadGroups} />}
      {fresh && leadGroups.length > 0 && <ReferralsCard onboardings={onboardings} leadGroups={leadGroups} />}

      <p className="flex gap-3 text-sm text-fg-faint"><BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden /><span>Courses and bounties show up here once they launch. Meanwhile: docs, the Academy and dev tools are on the <a href={BUILDER_HUB_URL} target="_blank" rel="noreferrer" className="underline decoration-brand underline-offset-2 hover:text-fg-heading">Avalanche Builder Hub</a>.</span></p>
    </div>
  )
}

function ReferralsCard({ onboardings, leadGroups }: { onboardings: number; leadGroups: { group: { id: string; slug: string; name: string } }[] }) {
  return (
    <SectionCard title="Referrals" actions={<Button asChild size="sm" variant="ghost"><Link href="/referrals">Your codes</Link></Button>}>
      <p className="flex items-center gap-3 text-sm text-fg-muted">
        <Megaphone className="size-5 text-brand" aria-hidden />
        {onboardings === 0 ? 'Share your referral link and bring builders to the hub.' : `You onboarded ${onboardings} builder${onboardings === 1 ? '' : 's'}.`}
      </p>
      {leadGroups.length > 0 && (
        <ul className="mt-4 divide-y divide-line">
          {leadGroups.map((g) => (
            <li key={g.group.id}><Link href={`/groups/${g.group.slug}`} className="flex min-h-12 items-center text-fg-body hover:text-fg-heading">{g.group.name} - group stats</Link></li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

type NextUp = HackathonMoment & { pending: boolean; event: { name: string; slug: string; coverUrl: string | null }; timezone: string }

function HackathonCard({ h, now }: { h: NextUp; now: Date }) {
  const when = h.at && `${formatShortDate(h.at, h.timezone, now)} · ${formatRelative(h.at, now)}`
  const headline =
    h.state === 'open' ? (h.submitted ? 'Submitted - you can still update it' : 'Submissions are open')
    : h.state === 'upcoming' ? (h.stage ? 'Submissions open soon' : 'Starts soon')
    : h.state === 'judging' ? (h.submitted ? 'Judges are reviewing your project' : 'Judging in progress')
    : 'Results are out'
  const detail = h.state === 'open' ? `${h.stage} closes ${when}` : h.state === 'upcoming' ? `${h.stage ?? 'Kick-off'} - ${when}` : h.state === 'results' ? `Published ${formatRelative(h.at!, now)}` : h.stage
  return (
    <div className="flex h-full gap-5 rounded-xl border border-line bg-surface-2 p-5 transition duration-200 hover:border-brand hover:shadow-glow">
      <EventCover src={h.event.coverUrl} className="size-20 shrink-0 sm:size-24" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/events/${h.event.slug}`} className="truncate text-lg text-fg-heading hover:underline hover:decoration-brand hover:underline-offset-4">{h.event.name}</Link>
          {h.pending && <StatusPill tone="warning">Awaiting approval</StatusPill>}
          {h.submitted && <StatusPill tone="success">Submitted</StatusPill>}
        </div>
        <p className={cn('mt-1', h.state === 'open' && !h.submitted ? 'text-brand' : 'text-fg-body')}>{headline}</p>
        {detail && <p className="text-sm text-fg-muted">{detail}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {h.state === 'open' && !h.pending && (
            <Button asChild size="sm" variant={h.submitted ? 'outline' : 'default'}><Link href={`/events/${h.event.slug}/submit`}>{h.submitted ? 'Update submission' : 'Submit your project'}</Link></Button>
          )}
          <Button asChild size="sm" variant="ghost"><Link href={`/events/${h.event.slug}`}>{h.state === 'results' ? 'See results' : 'Hackathon page'}</Link></Button>
        </div>
      </div>
    </div>
  )
}
