import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { ProjectVersionView } from '@/components/project-version-view'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { TeamPanel } from '../_components/team-panel'
import { getProjectForMember } from '../_lib/queries'
import { versionLabel } from '../_lib/rules'

export const metadata: Metadata = { title: 'Project', robots: { index: false } }

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser()
  const { slug } = await params
  const project = await getProjectForMember(slug, user.id)
  if (!project?.currentVersion) notFound()
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <section className="min-w-0 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="meta">{versionLabel(project.currentVersion)}</p>
          <Button asChild variant="outline" size="sm"><Link href={`/projects/${slug}/edit`}><Pencil aria-hidden /> Edit</Link></Button>
        </div>
        <ProjectVersionView version={project.currentVersion} />
      </section>
      <aside className="space-y-6">
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-4 text-lg">Team</h2>
          <TeamPanel projectId={project.id} meId={user.id} members={project.members} invites={project.invites} />
        </section>
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-1 text-lg">Versions</h2>
          <p className="mb-4 text-sm text-fg-muted">Edits change your draft. Submitting to a hackathon seals it as a version that never changes.</p>
          <ol className="relative space-y-4 border-l border-line pl-5">
            {project.versions.map((v) => (
              <li key={v.id} className="relative">
                <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full border ${v.sealedAt ? 'border-line bg-surface-0' : 'border-brand bg-brand'}`} />
                <Link href={`/projects/${slug}/versions/${v.number}`} className="text-sm text-fg-heading hover:underline">{versionLabel(v)}</Link>
                <p className="text-sm text-fg-muted">{v.sealedAt ? v.note : 'Your current edits — not submitted yet'}</p>
                <p className="meta">{(v.sealedAt ?? v.updatedAt).toISOString().slice(0, 10)}</p>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  )
}
