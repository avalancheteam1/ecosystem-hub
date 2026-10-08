import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { ProjectVersionView } from '@/components/project-version-view'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { getProjectForMember } from '../../../_lib/queries'

export const metadata: Metadata = { title: 'Project version', robots: { index: false } }

export default async function VersionPage({ params }: { params: Promise<{ slug: string; n: string }> }) {
  const user = await requireUser()
  const { slug, n } = await params
  const project = await getProjectForMember(slug, user.id)
  const number = Number(n)
  if (!project || !Number.isInteger(number)) notFound()
  const version = await prisma.projectVersion.findUnique({ where: { projectId_number: { projectId: project.id, number } } })
  if (!version) notFound()
  return (
    <div className="max-w-3xl">
      <BackLink href={`/projects/${slug}`}>Current version</BackLink>
      <p className="mb-6 rounded-lg border border-line bg-surface-1 px-4 py-3 text-sm text-fg-muted">
        {version.sealedAt ? `Version ${version.number}, sealed ${version.sealedAt.toISOString().slice(0, 10)}${version.note ? ` — ${version.note}` : ''}. Sealed versions never change.` : `Version ${version.number} is your draft — it changes as you edit.`}
      </p>
      <section className="rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <ProjectVersionView version={version} />
      </section>
    </div>
  )
}
