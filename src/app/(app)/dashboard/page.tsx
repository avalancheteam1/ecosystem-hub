import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, BookOpen, CalendarDays, Coins, FolderGit2, GraduationCap, Megaphone, Trophy, Users, type LucideIcon } from 'lucide-react'
import { SectionCard } from '@/components/section-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { BUILDER_HUB_URL } from '@/lib/builder-hub'
import { requireUser } from '@/lib/guards'
import { BUILDER_ROLES, hasCompleteBasicProfile } from '@/lib/profile'
import { cn, initials } from '@/lib/utils'
import { getUserGroups } from '@/lib/user-groups'
import { startSteps } from './_lib/start'

const STEP_ICON = { events: CalendarDays, project: FolderGit2, learn: GraduationCap, grants: Coins, team1: Users, invite: Megaphone } as Record<string, LucideIcon>

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser()
  const welcome = (await searchParams).welcome === '1'
  const [u, projects, hackathons, onboardings, { groups }] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true, image: true } }),
    prisma.project.findMany({ where: { archivedAt: null, members: { some: { userId: user.id } } }, include: { currentVersion: { select: { name: true, number: true } } }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.participant.findMany({ where: { userId: user.id, status: 'active' }, include: { hackathon: { include: { event: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.referral.count({ where: { referrerId: user.id } }),
    getUserGroups(user.id),
  ])
  // Nothing joined or created yet: lead with next steps instead of empty lists.
  const fresh = projects.length === 0 && hackathons.length === 0
  const leadGroups = groups.filter((g) => g.lead)
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
          <p className={cn('mt-1 text-fg-muted', !welcome && 'truncate')}>{welcome ? 'You’re in. Glad to have you — here’s where to start.' : meta.length ? meta.join(' — ') : user.email}</p>
        </div>
        <Button asChild variant="outline"><Link href="/profile">Edit profile</Link></Button>
      </header>

      {!hasCompleteBasicProfile(u) && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          Add your country and roles to your <Link href="/profile" className="underline decoration-brand underline-offset-2">profile</Link> — you need them to join hackathons.
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

      {!fresh && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Hackathons" actions={<Button asChild size="sm" variant="ghost"><Link href="/events">Browse events</Link></Button>}>
            {hackathons.length === 0 ? (
              <p className="flex items-center gap-3 text-sm text-fg-muted"><Trophy className="size-5 text-brand" aria-hidden /> You haven&apos;t joined a hackathon yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {hackathons.map((p) => (
                  <li key={p.id}><Link href={`/events/${p.hackathon.event.slug}`} className="flex min-h-12 items-center text-fg-body hover:text-fg-heading">{p.hackathon.event.name}</Link></li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Projects" actions={<Button asChild size="sm" variant="ghost"><Link href="/projects/new">New project</Link></Button>}>
            {projects.length === 0 ? (
              <p className="flex items-center gap-3 text-sm text-fg-muted"><FolderGit2 className="size-5 text-brand" aria-hidden /> Create a project to submit it to hackathons and grants.</p>
            ) : (
              <ul className="divide-y divide-line">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.slug}`} className="flex min-h-12 items-center justify-between gap-3 text-fg-body hover:text-fg-heading">
                      <span className="truncate">{p.currentVersion?.name}</span>
                      <span className="text-xs text-fg-faint">v{p.currentVersion?.number}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <ReferralsCard onboardings={onboardings} leadGroups={leadGroups} />
        </div>
      )}
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
            <li key={g.group.id}><Link href={`/groups/${g.group.slug}`} className="flex min-h-12 items-center text-fg-body hover:text-fg-heading">{g.group.name} — group stats</Link></li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
