import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { AnswerList } from '@/components/answer-fields'
import { BuiltDuringEvent } from '@/components/built-during-event'
import { ProjectVersionView } from '@/components/project-version-view'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'

export const metadata = { title: 'Submission' }

export default async function SubmissionPage({ params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await requireUser()
  const { id, submissionId } = await params
  const h = await getManagedHackathon(id, user)
  if (!h) notFound()
  const s = await prisma.submission.findFirst({
    where: { id: submissionId, hackathonId: h.id },
    include: { entries: { include: { projectVersion: true, assignments: { include: { judge: { select: { email: true, user: { select: { name: true } } } }, review: true } } } } },
  })
  if (!s) notFound()
  return (
    <div className="space-y-8">
      <BackLink href={`/manage/hackathons/${h.id}/submissions`}>Submissions</BackLink>
      {h.stages.map((st) => {
        const e = s.entries.find((x) => x.stageId === st.id)
        if (!e) return null
        const showScores = !!st.judgingClosedAt
        return (
          <SectionCard key={st.id} title={`${st.name} - version ${e.projectVersion.number}`} description={`Team at submission: ${(e.teamSnapshot as { name: string }[]).map((m) => m.name).join(', ')}`} actions={e.advancedAt ? <StatusPill tone="success">Advanced</StatusPill> : undefined}>
            <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
              <div className="min-w-0 space-y-8">
                <ProjectVersionView version={e.projectVersion} />
          <div className="mt-8"><BuiltDuringEvent preexisting={e.preexistingIdea} text={e.builtDuringEvent} /></div>
                <AnswerList fields={st.fields} answers={e.answers as Record<string, unknown>} />
              </div>
              <aside>
                <h3 className="mb-3 text-sm text-fg-muted">Reviews</h3>
                <ul className="space-y-3 text-sm">
                  {e.assignments.map((a) => (
                    <li key={a.id} className="rounded-lg border border-line p-3">
                      <div className="flex justify-between gap-2">
                        <span className="truncate text-fg-heading">{a.judge.user?.name ?? a.judge.email}</span>
                        {a.review?.conflictDeclared ? <StatusPill tone="warning">Conflict</StatusPill> : a.review?.submittedAt ? (showScores ? <span className="tabular-nums">{a.review.total}</span> : <StatusPill tone="success">Done</StatusPill>) : <StatusPill>Pending</StatusPill>}
                      </div>
                      {showScores && a.review?.comment && <p className="mt-2 whitespace-pre-wrap text-fg-muted">{a.review.comment}</p>}
                    </li>
                  ))}
                  {e.assignments.length === 0 && <li className="text-fg-muted">No judges assigned yet.</li>}
                </ul>
                {!showScores && e.assignments.length > 0 && <p className="mt-3 text-xs text-fg-faint">Scores are revealed when you close judging for this stage.</p>}
              </aside>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
