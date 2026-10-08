import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen, FolderGit2, Trophy } from 'lucide-react'
import { SectionCard } from '@/components/section-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { countryName } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { BUILDER_ROLES, hasCompleteBasicProfile } from '@/lib/profile'
import { initials } from '@/lib/utils'

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false } }

export default async function DashboardPage() {
  const user = await requireUser()
  const [u, projects, hackathons] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, username: true, country: true, builderRoles: true, image: true } }),
    prisma.project.findMany({ where: { archivedAt: null, members: { some: { userId: user.id } } }, include: { currentVersion: { select: { name: true, number: true } } }, orderBy: { updatedAt: 'desc' }, take: 5 }),
    prisma.participant.findMany({ where: { userId: user.id, status: 'active' }, include: { hackathon: { include: { event: { select: { name: true, slug: true } } } } }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ])
  const meta = [u.username && `@${u.username}`, countryName(u.country), u.builderRoles.map((r) => BUILDER_ROLES.find((x) => x.id === r)?.name).join(', ')].filter(Boolean)
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
      </div>
      <p className="flex items-center gap-3 text-sm text-fg-faint"><BookOpen className="size-4" aria-hidden /> Courses and bounties show up here once they launch.</p>
    </div>
  )
}
