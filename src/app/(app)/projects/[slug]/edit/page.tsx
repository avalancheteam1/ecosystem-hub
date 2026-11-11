import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { COUNTRIES } from '@/lib/countries'
import { reportRejectedNext, requireUser } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { DeleteProjectButton } from '../../_components/delete-project-button'
import { ProjectForm } from '../../_components/project-form'
import { getProjectForMember } from '../../_lib/queries'
import { canEditProject, canManageTeam, fieldsOf } from '../../_lib/rules'

export const metadata: Metadata = { title: 'Edit project', robots: { index: false } }

export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  await reportRejectedNext(nextParam)
  const project = await getProjectForMember((await params).slug, user.id)
  const v = project?.currentVersion
  const role = project?.members.find((m) => m.userId === user.id)?.role
  if (!project || !v || !role || !canEditProject(role)) notFound()
  const initial = fieldsOf(v)
  return (
    <div>
      <PageHeader title={`Edit ${v.name}`} description={v.sealedAt ? `Version ${v.number} was submitted, so your changes start version ${v.number + 1} (draft). What you submitted stays exactly as it was.` : 'Changes go into your draft. Anything you already submitted stays exactly as it was.'} />
      <ProjectForm projectId={project.id} initial={initial} next={nextParam ? safeNext(nextParam) : null} countries={COUNTRIES} />
      {canManageTeam(role) && (
        <section aria-labelledby="danger-zone" className="mt-12 rounded-xl border border-destructive/40 p-6">
          <h2 id="danger-zone" className="text-lg">Danger zone</h2>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-prose text-sm text-fg-muted">Deleting removes the project for the whole team. Submissions to finished hackathons keep their submitted version. Not possible while the project is in a running hackathon.</p>
            <DeleteProjectButton projectId={project.id} name={v.name} />
          </div>
        </section>
      )}
    </div>
  )
}
