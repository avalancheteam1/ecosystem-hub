import { notFound } from 'next/navigation'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { SectionCard } from '@/components/section-card'
import { requireUser } from '@/lib/guards'
import { JudgeList, OrganizerList } from '../_components/people-editors'

export const metadata = { title: 'People' }

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <SectionCard title="Organisers" description="Can change everything about this hackathon, see all scores and pick winners.">
        <OrganizerList hackathonId={h.id} organizers={h.organizers} />
      </SectionCard>
      <SectionCard title="Judges" description="Review the submissions assigned to them. They never see other judges’ scores, and never get projects they’re part of.">
        <JudgeList hackathonId={h.id} judges={h.judges} tracks={h.tracks} />
      </SectionCard>
    </div>
  )
}
