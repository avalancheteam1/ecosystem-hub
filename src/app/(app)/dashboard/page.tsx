import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, FolderGit2, Megaphone, Trophy } from 'lucide-react'
import { SectionCard } from '@/components/section-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { BUILDER_HUB_URL } from '@/lib/builder-hub'
import { requireUser } from '@/lib/guards'
import { BUILDER_ROLES, hasCompleteBasicProfile } from '@/lib/profile'
import { initials } from '@/lib/utils'
import { getUserGroups } from '@/lib/user-groups'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

export default async function DashboardPage() {
  const user = await requireUser()
  const [u, projects, hackathons, onboardings, { groups }] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true, image: true } }),
    prisma.project.findMany({ where: { archivedAt: null, members: { some: { userId: user.id } } }, include: { currentVersion: { select: { name: true, number: true } } }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.participant.findMany({ where: { userId: user.id, status: 'active' }, include: { hackathon: { include: { event: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.referral.count({ where: { referrerId: user.id } }),
    getUserGroups(user.id),
  ])
  const meta = [countryName(u.country), u.builderRoles.map((r) => BUILDER_ROLES.find((x) => x.id === r)?.name).join(', ')].filter(Boolean)
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-5">
        <Avatar className="size-16 border border-line">
          {u.image && <AvatarImage src={u.image} alt="" />}
          <AvatarFallback className="bg-surface-hover text-lg">{initials(u.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl sm:text-4xl">Hi, {u.name.split(' ')[0]}</h1>
          <p className="mt-1 truncate text-fg-muted">{meta.length ? meta.join(' — ') : user.email}</p>
        </div>
        <Button asChild variant="outline"><Link href="/profile">Edit profile</Link></Button>
      </header>

      {!hasCompleteBasicProfile(u) && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          Add your country and roles to your <Link href="/profile" className="underline decoration-brand underline-offset-2">profile</Link> — you need them to join hackathons.
        </p>
      )}

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
        <SectionCard title="Referrals" actions={<Button asChild size="sm" variant="ghost"><Link href="/referrals">Your codes</Link></Button>}>
          <p className="flex items-center gap-3 text-sm text-fg-muted">
            <Megaphone className="size-5 text-brand" aria-hidden />
            {onboardings === 0 ? 'Share your referral link and bring builders to the hub.' : `You onboarded ${onboardings} builder${onboardings === 1 ? '' : 's'}.`}
          </p>
          {groups.some((g) => g.lead) && (
            <ul className="mt-4 divide-y divide-line">
              {groups.filter((g) => g.lead).map((g) => (
                <li key={g.group.id}><Link href={`/groups/${g.group.slug}`} className="flex min-h-12 items-center text-fg-body hover:text-fg-heading">{g.group.name} — group stats</Link></li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <p className="flex items-center gap-3 text-sm text-fg-faint"><BookOpen className="size-4" aria-hidden /> Courses and bounties show up here once they launch. Meanwhile: docs, the Academy and dev tools are on the <a href={BUILDER_HUB_URL} target="_blank" rel="noreferrer" className="underline decoration-brand underline-offset-2 hover:text-fg-heading">Avalanche Builder Hub</a>.</p>
    </div>
  )
}
