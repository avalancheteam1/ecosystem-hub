import { notFound } from 'next/navigation'
import { getManagedHackathon, getStageJudging } from '@/app/(site)/events/_lib/hackathons/queries'
import { criterionMeans, entryTracks, judgeEligibility, rankEntries, type Pair } from '@/app/(site)/events/_lib/hackathons/judging'
import { stageState } from '@/app/(site)/events/_lib/hackathons/rules'
import { SectionCard } from '@/components/section-card'
import { StageStateBadge } from '@/components/stage-state-badge'
import { requireUser } from '@/lib/guards'
import { AssignmentMatrix, AssignPanel, CloseJudgingButton, RankingTable, type MatrixCell } from '../_components/judging-controls'

export const metadata = { title: 'Judging' }

export default async function JudgingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const now = new Date()
  const stages = await Promise.all(h.stages.map(async (s) => ({ s, entries: await getStageJudging(s.id) })))
  return (
    <div className="space-y-8">
      {h.judges.length === 0 && <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">No judges yet - invite them under People.</p>}
      {stages.map(({ s, entries }, i) => {
        const state = stageState(s, now)
        const active = entries.filter((e) => e.submission.status === 'active')
        const assigned = active.reduce((a, e) => a + e.assignments.length, 0)
        const done = active.reduce((a, e) => a + e.assignments.filter((x) => x.review?.submittedAt && !x.review.conflictDeclared).length, 0)
        const conflicts = active.reduce((a, e) => a + e.assignments.filter((x) => x.review?.conflictDeclared).length, 0)
        const uncovered = active.filter((e) => e.assignments.length === 0).length
        const closed = !!s.judgingClosedAt
        const counted = (e: (typeof active)[number]) => e.assignments.flatMap((a) => (a.review?.submittedAt && !a.review.conflictDeclared && a.review.total != null ? [a.review] : []))
        const ranked = closed ? rankEntries(active.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, totals: counted(e).map((r) => r.total!) }))) : []
        const byId = new Map(active.map((e) => [e.id, e]))
        const judges = h.judges.map((j) => ({ id: j.id, label: j.user?.name ?? j.email, userId: j.userId, trackIds: j.trackIds }))
        const matrix = active.map((e) => {
          const declared: Pair[] = e.assignments.filter((a) => a.review?.conflictDeclared).map((a) => [a.judgeId, e.id])
          const forRules = { id: e.id, trackIds: entryTracks(e.submission.trackIds, s.sameTrackOnly), teamUserIds: [...(e.teamSnapshot as { userId: string }[]).map((m) => m.userId), ...e.submission.project.members.map((m) => m.userId)] }
          const cells: MatrixCell[] = judges.map((j) => {
            const a = e.assignments.find((x) => x.judgeId === j.id)
            if (a) return { kind: 'assigned', assignmentId: a.id, state: a.review?.conflictDeclared ? 'conflict' : a.review?.submittedAt ? 'done' : a.review ? 'draft' : 'pending' }
            const ok = judgeEligibility(j, forRules, declared)
            return ok.ok ? { kind: 'open' } : { kind: 'blocked', reason: ok.reason }
          })
          return { entryId: e.id, name: e.projectVersion.name, cells }
        })
        return (
          <SectionCard
            key={s.id}
            title={`${i + 1}. ${s.name}`}
            description={`${active.length} submissions - ${done} of ${assigned - conflicts} reviews done${conflicts ? ` - ${conflicts} conflict${conflicts === 1 ? '' : 's'} declared${s.reviewMode === 'random' ? ' (draw again to replace)' : ''}` : ''}${uncovered ? ` - ${uncovered} without judges` : ''}`}
            actions={
              <>
                <StageStateBadge state={state} />
                <CloseJudgingButton hackathonId={h.id} stageId={s.id} closed={closed} canClose={state === 'judging'} />
              </>
            }
          >
            {assigned > 0 && (
              <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={done} aria-valuemax={assigned - conflicts} aria-label="Review progress">
                <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${assigned - conflicts ? (done / (assigned - conflicts)) * 100 : 0}%` }} />
              </div>
            )}
            {closed ? (
              <RankingTable
                hackathonId={h.id}
                stageId={s.id}
                canAdvance={i < h.stages.length - 1}
                criteria={s.criteria.map((c) => ({ id: c.id, name: c.name }))}
                scaleMax={s.scaleMax}
                rows={ranked.map((r) => {
                  const e = byId.get(r.entryId)!
                  return { ...r, name: e.projectVersion.name, href: `/manage/hackathons/${h.id}/submissions/${e.submission.id}`, advanced: !!e.advancedAt, criterionMeans: criterionMeans(counted(e).map((x) => x.scores as Record<string, unknown>), s.criteria) }
                })}
              />
            ) : active.length === 0 ? (
              <p className="text-sm text-fg-muted">No submissions yet.</p>
            ) : (
              <div className="space-y-8">
                {s.reviewMode === 'random' ? (
                  <AssignPanel hackathonId={h.id} stageId={s.id} perEntry={s.judgesPerSubmission} hasAssignments={assigned > 0} />
                ) : (
                  <p className="text-sm text-fg-muted">All judges - every eligible judge sees every submission automatically once submissions close. <span className="text-fg-faint">(Change under Stages.)</span></p>
                )}
                {judges.length > 0 && <AssignmentMatrix hackathonId={h.id} judges={judges.map((j) => ({ id: j.id, label: j.label }))} rows={matrix} manual={s.reviewMode === 'random'} />}
              </div>
            )}
          </SectionCard>
        )
      })}
    </div>
  )
}
