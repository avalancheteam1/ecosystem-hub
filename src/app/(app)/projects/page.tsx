import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { initials } from '@/lib/utils'
import { listMyProjects } from './_lib/queries'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { versionLabel } from './_lib/rules'

export const metadata: Metadata = { title: 'Your projects', robots: { index: false } }

export default async function ProjectsPage() {
  const user = await requireUser()
  const projects = await listMyProjects(user.id)
  return (
    <>
      <PageHeader title="Your projects" description="Build once, keep improving, submit any version to hackathons and grants.">
        <Button asChild size="sm" className="h-10"><Link href="/projects/new"><Plus aria-hidden /> New project</Link></Button>
      </PageHeader>
      {projects.length === 0 ? (
        <EmptyState title="No projects yet" action={<Button asChild><Link href="/projects/new">Create a project</Link></Button>}>
          Create your first project. Every save keeps a version, so you can submit exactly what you built at each hackathon.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.slug}`} className="flex h-full gap-4 rounded-xl border border-line bg-surface-2 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
                {p.currentVersion?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- builder-provided URL
                  <img src={p.currentVersion.logoUrl} alt="" className="size-12 shrink-0 rounded-xl border border-line object-cover" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-1 text-brand">{initials(p.currentVersion?.name ?? '?')}</span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate text-lg">{p.currentVersion?.name}</h2>
                  <p className="line-clamp-2 text-sm text-fg-muted">{p.currentVersion?.shortDescription}</p>
                  <p className="meta mt-3">{p.currentVersion?.maturity && `${PROJECT_MATURITY[p.currentVersion.maturity as ProjectMaturity]?.label} — `}{p.currentVersion && versionLabel(p.currentVersion)} — {p._count.members} {p._count.members === 1 ? 'member' : 'members'}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
