import { notFound } from 'next/navigation'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { SectionCard } from '@/components/section-card'
import { requireUser } from '@/lib/guards'
import { FieldList } from '../_components/field-editor'

export const metadata = { title: 'Registration' }

export default async function RegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  return (
    <div className="max-w-3xl">
      <SectionCard title="Registration questions" description="Asked when a builder joins. Their name and email come from their account — don't ask again.">
        <FieldList hackathonId={h.id} stageId={null} fields={h.fields} emptyText="No questions — joining is one click." />
      </SectionCard>
    </div>
  )
}
