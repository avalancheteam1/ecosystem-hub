import { notFound } from 'next/navigation'
import { Plus } from 'lucide-react'
import { getManagedHackathon, stageReviewCounts } from '@/app/(site)/events/_lib/hackathons/queries'
import { stageState } from '@/app/(site)/events/_lib/hackathons/rules'
import { SectionCard } from '@/components/section-card'
import { StageStateBadge } from '@/components/stage-state-badge'
import { Button } from '@/components/ui/button'
import { formatEventRange } from '@/lib/dates'
import { requireUser } from '@/lib/guards'
import { FieldList } from '../_components/field-editor'
import { CloseSubmissions, CriterionDialog, DeleteCriterion, DeleteStage, DuplicateStage, OpenSubmissions, StageDialog } from '../_components/stage-editors'

export const metadata = { title: 'Stages' }

export default async function StagesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const now = new Date()
  const tz = h.timezone
  const reviews = await stageReviewCounts(h.stages.map((s) => s.id))
  const trackJudges = h.judges.some((j) => j.trackIds.length > 0)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-fg-muted">Stages run in order and may overlap. Each later stage is either for the teams you advance or open to every registered team.</p>
        <StageDialog hackathonId={h.id} timeZone={h.timezone} defaults={{ opensAt: h.event.startAt, closesAt: h.event.endAt }} first={!h.stages.length} trackJudges={trackJudges} trigger={<Button size="sm"><Plus aria-hidden /> Stage</Button>} />
      </div>
      {h.stages.map((stage, i) => {
        const s = { ...stage, entries: stage._count.entries, reviews: reviews.get(stage.id) ?? 0 }
        const state = stageState(s, now)
        const totalWeight = s.criteria.reduce((a, c) => a + c.weight, 0)
        return (
          <SectionCard
            key={s.id}
            title={`${i + 1}. ${s.name}`}
            description={`${formatEventRange(s.opensAt, s.closesAt, tz)} - ${s.reviewMode === 'all' ? 'every judge reviews every submission' : `${s.judgesPerSubmission} random judge${s.judgesPerSubmission === 1 ? '' : 's'} per submission`} - scored 0–${s.scaleMax}${i > 0 ? (s.advancedOnly ? ' - advanced teams only' : ' - open to all teams') : ''}`}
            actions={
              <>
                <StageStateBadge state={state} />
                {state === 'open' ? <CloseSubmissions hackathonId={h.id} stage={s} /> : <OpenSubmissions hackathonId={h.id} stage={s} timeZone={tz} />}
                <StageDialog hackathonId={h.id} timeZone={h.timezone} stage={s} first={i === 0} trackJudges={trackJudges} trigger={<Button size="sm" variant="ghost">Edit</Button>} />
                <DuplicateStage hackathonId={h.id} stageId={s.id} />
                {s.entries === 0 && <DeleteStage hackathonId={h.id} stage={s} />}
              </>
            }
          >
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm text-fg-muted">Judging criteria</h3>
                {s.criteria.length === 0 ? (
                  <p className="text-sm text-fg-muted">No criteria yet - judges need at least one.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {s.criteria.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-fg-heading sm:truncate">{c.name}</p>
                          {c.description && <p className="truncate text-xs text-fg-muted">{c.description}</p>}
                        </div>
                        <span className="text-sm text-fg-muted tabular-nums">{Math.round((c.weight / totalWeight) * 100)}%</span>
                        <CriterionDialog hackathonId={h.id} stageId={s.id} criterion={c} trigger={<Button size="sm" variant="ghost">Edit</Button>} />
                        <DeleteCriterion hackathonId={h.id} stageId={s.id} criterion={c} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3"><CriterionDialog hackathonId={h.id} stageId={s.id} trigger={<Button size="sm" variant="outline">Add criterion</Button>} /></div>
              </div>
              <div>
                <h3 className="mb-3 text-sm text-fg-muted">Extra questions for this stage</h3>
                <FieldList hackathonId={h.id} stageId={s.id} fields={s.fields} emptyText="Teams submit their project version - add questions for anything else (pitch deck link, contract address…)." />
              </div>
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
