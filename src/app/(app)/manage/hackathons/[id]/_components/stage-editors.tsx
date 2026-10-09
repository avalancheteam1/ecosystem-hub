'use client'

import { useState } from 'react'
import { windowChangeWarnings } from '@/app/(site)/events/_lib/hackathons/rules'
import { deleteCriterion, deleteStage, duplicateStage, saveCriterion, saveStage, setSubmissionsOpen } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { MarkdownField } from '@/components/markdown-field'
import { SegmentedControl } from '@/components/segmented-control'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { utcToZoned } from '@/lib/timezones'

type Stage = {
  id: string; name: string; descriptionMd: string | null; opensAt: Date; closesAt: Date; judgingClosedAt: Date | null; reviewMode: string; judgesPerSubmission: number | null; scaleMax: number; showCriteria: boolean
  /** Entries and submitted reviews — what a window change affects. */
  entries: number; reviews: number
}

/** Consequences of a window change, shown before saving (never blocking). */
function WindowWarnings({ stage, opensAt, closesAt }: { stage: Stage; opensAt: string; closesAt: string }) {
  if (!opensAt || !closesAt) return null
  const warnings = windowChangeWarnings(stage, { opensAt: new Date(opensAt), closesAt: new Date(closesAt) }, new Date())
  if (!warnings.length) return null
  return (
    <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <p className="mb-1 text-fg-heading">This changes a stage that is already running:</p>
      <ul className="list-disc space-y-1 pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
    </div>
  )
}
type Criterion = { id: string; name: string; description: string | null; weight: number }

/** `timeZone`: the hackathon's zone — inputs are wall time there, saved as UTC. `defaults` prefill a new stage's window (the event dates). */
export function StageDialog({ hackathonId, stage, trigger, timeZone, defaults }: { hackathonId: string; stage?: Stage; trigger: React.ReactNode; timeZone: string; defaults?: { opensAt: Date; closesAt: Date | null } }) {
  const empty = {
    name: stage?.name ?? '', descriptionMd: stage?.descriptionMd ?? '', opensAt: utcToZoned(stage?.opensAt ?? defaults?.opensAt, timeZone), closesAt: utcToZoned(stage?.closesAt ?? defaults?.closesAt, timeZone),
    reviewMode: (stage?.reviewMode ?? 'all') as 'all' | 'random', judgesPerSubmission: stage?.judgesPerSubmission ? String(stage.judgesPerSubmission) : '2',
    scaleMax: String(stage?.scaleMax ?? 10), showCriteria: stage?.showCriteria ?? true,
  }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      wide
      trigger={trigger}
      title={stage ? `Edit ${stage.name}` : 'New stage'}
      description="A stage is a round: teams submit during its window, then judges review."
      submitLabel={stage ? 'Save stage' : 'Add stage'}
      pending={pending}
      onOpenChange={(o) => o && setV(empty)}
      onSubmit={() =>
        run(() => saveStage({ hackathonId, stageId: stage?.id, ...v, opensAt: toUtcIso(v.opensAt, timeZone), closesAt: toUtcIso(v.closesAt, timeZone), judgesPerSubmission: v.reviewMode === 'random' ? v.judgesPerSubmission : '' }), stage ? 'Stage saved' : 'Stage added')
      }
    >
      <Field id="st-name" label="Name"><Input id="st-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={60} placeholder="Idea, MVP, Finals…" className="h-11" /></Field>
      <MarkdownField id="st-desc" label="What teams submit" hint="Shown on the stage in the timeline and on the submit page." value={v.descriptionMd} onChange={(t) => setV({ ...v, descriptionMd: t })} rows={6} placeholder={'Submit your project with:\n- a public repository\n- a 2-minute demo video'} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="st-open" label="Submissions open"><DateTimeInput id="st-open" required value={v.opensAt} onChange={(w) => setV({ ...v, opensAt: w })} timeZone={timeZone} /></Field>
        <Field id="st-close" label="Submissions close"><DateTimeInput id="st-close" required value={v.closesAt} onChange={(w) => setV({ ...v, closesAt: w })} timeZone={timeZone} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="st-mode" label="Who reviews" hint={v.reviewMode === 'all' ? 'Every eligible judge reviews every submission — they see them automatically once submissions close.' : 'Random judges per submission — you draw them on the Judging tab.'}>
          <SegmentedControl label="Who reviews" value={v.reviewMode} onChange={(m) => setV({ ...v, reviewMode: m })} options={[{ value: 'all', label: 'All judges' }, { value: 'random', label: 'Random judges' }]} />
        </Field>
        <Field id="st-scale" label="Score scale" hint="Each criterion is scored 0 to this."><Input id="st-scale" type="number" min={1} max={100} value={v.scaleMax} onChange={(e) => setV({ ...v, scaleMax: e.target.value })} className="h-11" /></Field>
      </div>
      {v.reviewMode === 'random' && (
        <div className="rounded-lg border border-line p-4">
          <Field id="st-n" label="Judges per submission" hint="Judges are drawn at random, balanced so everyone gets a similar load. Judges limited to certain tracks only get those."><Input id="st-n" type="number" min={1} max={20} value={v.judgesPerSubmission} onChange={(e) => setV({ ...v, judgesPerSubmission: e.target.value })} className="h-11" /></Field>
        </div>
      )}
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={v.showCriteria} onCheckedChange={(c) => setV({ ...v, showCriteria: c === true })} /> Show the judging criteria on the public page</label>
      {stage && <WindowWarnings stage={stage} opensAt={toUtcIso(v.opensAt, timeZone)} closesAt={toUtcIso(v.closesAt, timeZone)} />}
      <p className="text-xs text-fg-faint">Times are in {timeZone} (the hackathon’s timezone — change it in Overview).</p>
    </FormDialog>
  )
}

const HOUR = 60 * 60 * 1000

/** Now + 1 h, rounded up to the full hour in the hackathon's zone (half-hour zones round there, not in UTC). */
function nextFullHour(timeZone: string) {
  const target = Date.now() + HOUR
  const floor = Date.parse(toUtcIso(utcToZoned(new Date(target), timeZone).slice(0, 14) + '00', timeZone))
  return new Date(floor < target ? floor + HOUR : floor)
}

/** Opens submissions now, until the chosen time (default: now + 1 h, on the full hour). */
export function OpenSubmissions({ hackathonId, stage, timeZone }: { hackathonId: string; stage: Stage; timeZone: string }) {
  const initial = () => utcToZoned(nextFullHour(timeZone), timeZone)
  const [closesAt, setClosesAt] = useState('')
  const { pending, run } = useActionToast()
  const closesIso = toUtcIso(closesAt, timeZone)
  const now = new Date()
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline">Open submissions</Button>}
      title={`Open submissions for ${stage.name}`}
      description="Teams can submit from now until the time below."
      submitLabel="Open submissions"
      pending={pending}
      onOpenChange={(o) => o && setClosesAt(initial())}
      onSubmit={() => run(() => setSubmissionsOpen({ hackathonId, stageId: stage.id, open: true, closesAt: closesIso }), 'Submissions are open')}
    >
      <Field id={`open-${stage.id}`} label="Submissions close"><DateTimeInput id={`open-${stage.id}`} required value={closesAt} onChange={setClosesAt} timeZone={timeZone} /></Field>
      <WindowWarnings stage={stage} opensAt={(stage.opensAt < now ? stage.opensAt : now).toISOString()} closesAt={closesIso} />
      <p className="text-xs text-fg-faint">Times are in {timeZone}.</p>
    </FormDialog>
  )
}

/** Closes submissions right now. */
export function CloseSubmissions({ hackathonId, stage }: { hackathonId: string; stage: Stage }) {
  const { pending, run } = useActionToast()
  const confirmClose = () => {
    const now = new Date()
    const warnings = windowChangeWarnings(stage, { opensAt: stage.opensAt < now ? stage.opensAt : now, closesAt: now }, now)
    if (confirm([`Close submissions for "${stage.name}" now?`, ...warnings.map((w) => `• ${w}`)].join('\n\n'))) run(() => setSubmissionsOpen({ hackathonId, stageId: stage.id, open: false }), 'Submissions are closed')
  }
  return <Button size="sm" variant="outline" disabled={pending} onClick={confirmClose}>Close submissions</Button>
}

/** Copies settings, window, criteria and questions into a new last stage. */
export function DuplicateStage({ hackathonId, stageId }: { hackathonId: string; stageId: string }) {
  const { pending, run } = useActionToast()
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => duplicateStage({ hackathonId, stageId }), 'Stage duplicated — check its dates')}>Duplicate</Button>
}

export function DeleteStage({ hackathonId, stage }: { hackathonId: string; stage: Stage }) {
  const { pending, run } = useActionToast()
  return <ConfirmButton disabled={pending} message={`Delete the stage "${stage.name}" with its criteria and questions?`} onConfirm={() => run(() => deleteStage({ hackathonId, stageId: stage.id }), 'Stage deleted')}>Delete stage</ConfirmButton>
}

export function CriterionDialog({ hackathonId, stageId, criterion, trigger }: { hackathonId: string; stageId: string; criterion?: Criterion; trigger: React.ReactNode }) {
  const empty = { name: criterion?.name ?? '', description: criterion?.description ?? '', weight: String(criterion?.weight ?? 1) }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={trigger}
      title={criterion ? 'Edit criterion' : 'New criterion'}
      submitLabel={criterion ? 'Save criterion' : 'Add criterion'}
      pending={pending}
      onOpenChange={(o) => o && setV(empty)}
      onSubmit={() => run(() => saveCriterion({ hackathonId, stageId, criterionId: criterion?.id, ...v }), criterion ? 'Criterion saved' : 'Criterion added')}
    >
      <Field id="cr-name" label="Name"><Input id="cr-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={60} placeholder="Technical execution" className="h-11" /></Field>
      <Field id="cr-desc" label="What judges look for (optional)"><Textarea id="cr-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={3} maxLength={500} /></Field>
      <Field id="cr-weight" label="Weight" hint="Relative importance: weight 2 counts twice as much as weight 1."><Input id="cr-weight" type="number" min={1} max={100} value={v.weight} onChange={(e) => setV({ ...v, weight: e.target.value })} className="h-11" /></Field>
    </FormDialog>
  )
}

export function DeleteCriterion({ hackathonId, stageId, criterion }: { hackathonId: string; stageId: string; criterion: Criterion }) {
  const { pending, run } = useActionToast()
  return <ConfirmButton disabled={pending} message={`Delete "${criterion.name}"?`} onConfirm={() => run(() => deleteCriterion({ hackathonId, stageId, criterionId: criterion.id }), 'Criterion deleted')}>Delete</ConfirmButton>
}
