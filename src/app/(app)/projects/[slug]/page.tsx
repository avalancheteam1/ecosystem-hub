import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flag, Pencil } from 'lucide-react'
import { ProjectVersionView } from '@/components/project-version-view'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { MilestonesPanel } from '../_components/milestones'
import { SealVersionButton } from '../_components/seal-version-button'
import { TeamPanel } from '../_components/team-panel'
import { getProjectForMember } from '../_lib/queries'
import { canEditProject, versionLabel, wasReplaced, type MilestoneStatus } from '../_lib/rules'

const VISIBLE_VERSIONS = 3

type VersionEntry = { id: string; stage: { name: string; hackathon: { event: { name: string; slug: string } } } }

function VersionItem({ slug, v }: { slug: string; v: { number: number; note: string | null; sealedAt: Date | null; updatedAt: Date; stageEntries: VersionEntry[] } }) {
  const submitted = v.stageEntries.length > 0
  const replaced = wasReplaced({ ...v, entries: v.stageEntries.length })
  return (
    <li className="relative">
      {submitted ? (
        <Flag aria-hidden className="absolute top-0.5 -left-[29px] size-4 rounded-sm bg-surface-2 fill-brand text-brand" />
      ) : (
        <span aria-hidden className={`absolute top-1.5 -left-[25px] size-2.5 rounded-full border ${v.sealedAt ? 'border-line bg-surface-0' : 'border-brand bg-brand'}`} />
      )}
      <Link href={`/projects/${slug}/versions/${v.number}`} className="text-sm text-fg-heading hover:underline">{versionLabel(v)}</Link>
      {submitted ? (
        <ul className="text-sm text-fg-muted">
          {v.stageEntries.map((e) => (
            <li key={e.id}>
              Submitted to <Link href={`/events/${e.stage.hackathon.event.slug}`} className="text-fg-body underline-offset-2 hover:text-brand hover:underline">{e.stage.hackathon.event.name}</Link> · {e.stage.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">
          {v.sealedAt ? v.note : 'Your current edits - not saved as a version yet'}
          {replaced && <span className="text-fg-faint"> · replaced by a later version</span>}
        </p>
      )}
      <p className="meta">{(v.sealedAt ?? v.updatedAt).toISOString().slice(0, 10)}</p>
    </li>
  )
}

export const metadata: Metadata = { title: 'Project', robots: { index: false } }

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser()
  const { slug } = await params
  const project = await getProjectForMember(slug, user.id)
  if (!project?.currentVersion) notFound()
  const myRole = project.members.find((m) => m.userId === user.id)!.role
  const canEdit = canEditProject(myRole)
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
      <section className="min-w-0 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="meta">{versionLabel(project.currentVersion)}</p>
          {canEdit && <Button asChild variant="outline" size="sm"><Link href={`/projects/${slug}/edit`}><Pencil aria-hidden /> Edit</Link></Button>}
        </div>
        <ProjectVersionView version={project.currentVersion} />
      </section>
      <aside className="space-y-6">
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-4 text-lg">Team</h2>
          <TeamPanel projectId={project.id} meId={user.id} members={project.members} invites={myRole === 'owner' ? project.invites : []} />
        </section>
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-1 text-lg">Milestones</h2>
          <p className="mb-4 text-sm text-fg-muted">{canEdit ? 'Your roadmap - changes save right away.' : 'The team’s roadmap.'}</p>
          <MilestonesPanel projectId={project.id} readOnly={!canEdit} milestones={project.milestones.map((m) => ({ ...m, status: m.status as MilestoneStatus }))} />
        </section>
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="mb-1 text-lg">Versions</h2>
          <p className="mb-4 text-sm text-fg-muted">Edits change your draft. Saving it as a version, or submitting it to a hackathon, seals it - sealed versions never change.</p>
          {canEdit && !project.currentVersion.sealedAt && <SealVersionButton projectId={project.id} number={project.currentVersion.number} />}
          <ol className="relative space-y-4 border-l border-line pl-5">
            {project.versions.slice(0, VISIBLE_VERSIONS).map((v) => <VersionItem key={v.id} slug={slug} v={v} />)}
          </ol>
          {project.versions.length > VISIBLE_VERSIONS && (
            // Native disclosure: older versions stay one click away without client JS.
            <details className="group">
              <summary className="mt-4 flex min-h-11 cursor-pointer list-none items-center text-sm text-fg-muted hover:text-fg-heading [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">… show {project.versions.length - VISIBLE_VERSIONS} older {project.versions.length - VISIBLE_VERSIONS === 1 ? 'version' : 'versions'}</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {project.versions.slice(VISIBLE_VERSIONS).map((v) => <VersionItem key={v.id} slug={slug} v={v} />)}
              </ol>
            </details>
          )}
        </section>
      </aside>
    </div>
  )
}
