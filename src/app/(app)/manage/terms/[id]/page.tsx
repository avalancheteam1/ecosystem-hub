import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { DataTerms } from '@/app/(site)/events/_components/hackathon/data-terms'
import { PageHeader } from '@/components/layout/page-header'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'

export const metadata: Metadata = { title: 'Organiser terms', robots: { index: false } }

// getManagedHackathon sends unaccepted organisers here; accepting refreshes → redirect back.
export default async function OrganizerTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const row = await prisma.hackathonOrganizer.findFirst({ where: { hackathonId: id, userId: user.id }, select: { termsAcceptedAt: true, hackathon: { select: { event: { select: { name: true } } } } } })
  if (!row) notFound()
  if (row.termsAcceptedAt) redirect(`/manage/hackathons/${id}`)
  return (
    <>
      <PageHeader title={row.hackathon.event.name} description="One step before you start organising." />
      <DataTerms hackathonId={id} role="organizer" />
    </>
  )
}
