import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { ProjectForm } from '../../_components/project-form'
import { getProjectForMember } from '../../_lib/queries'
import { fieldsOf } from '../../_lib/rules'

export const metadata: Metadata = { title: 'Edit project', robots: { index: false } }

export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  const project = await getProjectForMember((await params).slug, user.id)
  const v = project?.currentVersion
  if (!project || !v) notFound()
  const initial = fieldsOf(v)
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${v.name}`} description={v.sealedAt ? `Version ${v.number} was submitted, so your changes start version ${v.number + 1} (draft). What you submitted stays exactly as it was.` : 'Changes go into your draft. Anything you already submitted stays exactly as it was.'} />
      <ProjectForm projectId={project.id} initial={initial} next={nextParam ? safeNext(nextParam) : null} />
    </div>
  )
}
