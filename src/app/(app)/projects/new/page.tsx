import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { ProjectForm } from '../_components/project-form'

export const metadata: Metadata = { title: 'New project', robots: { index: false } }

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireUser()
  const nextParam = (await searchParams).next
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New project" description="You can change everything later — each save becomes a new version." />
      <ProjectForm next={nextParam ? safeNext(nextParam) : null} />
    </div>
  )
}
