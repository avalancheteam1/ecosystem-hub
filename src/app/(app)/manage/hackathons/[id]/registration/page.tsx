import { notFound } from 'next/navigation'
import { getManagedHackathon, listRegistrationRequests } from '@/app/(site)/events/_lib/hackathons/queries'
import { AnswerList } from '@/components/answer-fields'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { requireUser } from '@/lib/guards'
import { FieldList } from '../_components/field-editor'
import { ApprovalSettings, ReviewButtons } from '../_components/registration-controls'

export const metadata = { title: 'Registration' }

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

export default async function RegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const requests = await listRegistrationRequests(h.id)
  const inviteUrl = h.inviteToken ? `${siteUrl()}/events/${h.event.slug}/join?invite=${h.inviteToken}` : null
  return (
    <div className="grid max-w-3xl gap-6">
      <SectionCard title="Approval" description="Decide who gets in.">
        <ApprovalSettings hackathonId={h.id} requireApproval={h.requireApproval} inviteUrl={inviteUrl} />
      </SectionCard>
      {(h.requireApproval || requests.length > 0) && (
        <SectionCard title="Registrations to review" description="Approved builders get an email. Rejected builders can't re-register, but you can still approve them here.">
          {requests.length ? (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id} className="grid gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-fg-heading">{r.user.name}</p>
                      <p className="truncate text-xs text-fg-muted">{r.user.email}</p>
                    </div>
                    {r.status === 'rejected' && <StatusPill tone="danger">Rejected</StatusPill>}
                    <ReviewButtons hackathonId={h.id} participantId={r.id} status={r.status} />
                  </div>
                  <AnswerList fields={h.fields} answers={r.answers as Record<string, unknown>} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">Nothing waiting.</p>
          )}
        </SectionCard>
      )}
      <SectionCard title="Registration questions" description="Asked when a builder registers. Their name and email come from their account - don't ask again.">
        <FieldList hackathonId={h.id} stageId={null} fields={h.fields} emptyText="No questions - registering is one click." />
      </SectionCard>
    </div>
  )
}
