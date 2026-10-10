import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { COUNTRIES } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { ProjectForm } from '../_components/project-form'

export const metadata: Metadata = { title: 'New project', robots: { index: false } }

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { country: true } })
  return (
    <div>
      <PageHeader title="New project" description="You can change everything later - each save becomes a new version." />
      <ProjectForm next={nextParam ? safeNext(nextParam) : null} countries={COUNTRIES} defaultCountry={me?.country} />
    </div>
  )
}
