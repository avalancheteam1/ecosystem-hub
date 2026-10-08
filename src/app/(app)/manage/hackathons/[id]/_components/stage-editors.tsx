'use client'

import { useState } from 'react'
import { deleteCriterion, deleteStage, saveCriterion, saveStage } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { MarkdownField } from '@/components/markdown-field'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { utcToZoned } from '@/lib/timezones'

type Stage = { id: string; name: string; descriptionMd: string | null; opensAt: Date; closesAt: Date; reviewMode: string; judgesPerSubmission: number | null; scaleMax: number; showCriteria: boolean }
type Criterion = { id: string; name: string; description: string | null; weight: number }

/** `timeZone`: the hackathon's zone — inputs are wall time there, saved as UTC. */
export function StageDialog({ hackathonId, stage, trigger, timeZone }: { hackathonId: string; stage?: Stage; trigger: React.ReactNode; timeZone: string }) {
  const empty = {
    name: stage?.name ?? '', descriptionMd: stage?.descriptionMd ?? '', opensAt: utcToZoned(stage?.opensAt, timeZone), closesAt: utcToZoned(stage?.closesAt, timeZone),
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
        <Field id="st-mode" label="Who reviews">
          <NativeSelect id="st-mode" value={v.reviewMode} onChange={(e) => setV({ ...v, reviewMode: e.target.value as 'all' | 'random' })}>
            <option value="all">Every judge reviews every submission</option>
            <option value="random">Random judges per submission</option>
          </NativeSelect>
        </Field>
        <Field id="st-scale" label="Score scale" hint="Each criterion is scored 0 to this."><Input id="st-scale" type="number" min={1} max={100} value={v.scaleMax} onChange={(e) => setV({ ...v, scaleMax: e.target.value })} className="h-11" /></Field>
      </div>
      {v.reviewMode === 'random' && (
        <div className="rounded-lg border border-line p-4">
          <Field id="st-n" label="Judges per submission" hint="Judges are drawn at random, balanced so everyone gets a similar load. Judges limited to certain tracks only get those."><Input id="st-n" type="number" min={1} max={20} value={v.judgesPerSubmission} onChange={(e) => setV({ ...v, judgesPerSubmission: e.target.value })} className="h-11" /></Field>
        </div>
      )}
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={v.showCriteria} onCheckedChange={(c) => setV({ ...v, showCriteria: c === true })} /> Show the judging criteria on the public page</label>
      <p className="text-xs text-fg-faint">Times are in {timeZone} (the hackathon’s timezone — change it in Overview).</p>
    </FormDialog>
  )
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
