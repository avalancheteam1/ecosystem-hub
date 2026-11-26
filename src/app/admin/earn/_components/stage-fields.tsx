'use client'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Field } from '@/components/field'
import { MarkdownField } from '@/components/markdown-field'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { EarnStageInput } from '@/app/(site)/earn/_lib/schemas'

export type DraftStage = EarnStageInput & { id: string }

export function blankStage(id: string, title = ''): DraftStage {
  return { id, title, deliverables: '', requiresPrevApproval: true, requiresPullRequest: false, submissionPolicy: 'resubmit', approvalLimit: null }
}

export function StageFields({ enabled, onEnabled, stages, onStages, feature, terms, onTermsChange }: {
  enabled: boolean; onEnabled: (value: boolean) => void; stages: DraftStage[]; onStages: (stages: DraftStage[]) => void; feature: boolean; terms: string; onTermsChange: (value: string) => void
}) {
  const prStage = stages.find((stage) => stage.requiresPullRequest)?.id ?? stages.at(-1)?.id
  function edit(id: string, change: Partial<EarnStageInput>) {
    onStages(stages.map((stage) => stage.id === id ? { ...stage, ...change } : stage))
  }

  function move(index: number, offset: number) {
    const next = [...stages]
    const [stage] = next.splice(index, 1)
    next.splice(index + offset, 0, stage)
    onStages(next)
  }

  return (
    <SectionCard title="Hub submissions">
      <label className="flex min-h-11 items-center gap-3">
        <Checkbox checked={enabled} onCheckedChange={(value) => onEnabled(value === true)} /> Accept submissions in the Hub
      </label>
      {enabled && (
        <div className="mt-4 space-y-5">
          <MarkdownField id="earn-terms" label="Terms contributors must accept" value={terms} onChange={onTermsChange} maxLength={6000} rows={4} required />
          {feature && <Field id="earn-pr-stage" label="Stage that collects the GitHub pull request">
            <NativeSelect id="earn-pr-stage" value={prStage} onChange={(event) => onStages(stages.map((stage) => ({ ...stage, requiresPullRequest: stage.id === event.target.value })))}>
              {stages.map((stage, index) => <option key={stage.id} value={stage.id}>{index + 1}. {stage.title || 'Untitled stage'}</option>)}
            </NativeSelect>
          </Field>}
          <ol className="space-y-4">
            {stages.map((stage, index) => {
              const field = `earn-stage-${stage.id}`
              return <li key={stage.id} className="space-y-4 rounded-lg border border-line bg-surface-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3>Stage {index + 1}{index === stages.length - 1 ? ' · Final' : ''}</h3>
                  {stages.length > 1 && <div className="flex flex-wrap gap-2">
                    <Button type="button" size="icon" variant="outline" aria-label={`Move stage ${index + 1} up`} disabled={!index} onClick={() => move(index, -1)}><ArrowUp /></Button>
                    <Button type="button" size="icon" variant="outline" aria-label={`Move stage ${index + 1} down`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                    <Button type="button" size="icon" variant="outline" aria-label={`Remove stage ${index + 1}`} onClick={() => onStages(stages.filter((item) => item.id !== stage.id))}><Trash2 /></Button>
                  </div>}
                </div>
                <Field id={`${field}-title`} label="Stage title" required>
                  <Input id={`${field}-title`} value={stage.title} maxLength={160} required onChange={(event) => edit(stage.id, { title: event.target.value })} />
                </Field>
                <MarkdownField id={`${field}-deliverables`} label="Stage deliverables" value={stage.deliverables} onChange={(value) => edit(stage.id, { deliverables: value })} maxLength={6000} rows={2} required={stages.length > 1} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`${field}-policy`} label="Submission policy">
                    <NativeSelect id={`${field}-policy`} value={stage.submissionPolicy} onChange={(event) => edit(stage.id, { submissionPolicy: event.target.value as EarnStageInput['submissionPolicy'] })}>
                      <option value="single">One entry</option>
                      <option value="resubmit">Retry after a decision or withdrawal</option>
                      <option value="multiple">Multiple entries</option>
                    </NativeSelect>
                  </Field>
                  <Field id={`${field}-limit`} label={index === stages.length - 1 ? 'Maximum awards (optional)' : 'Maximum approvals (optional)'}>
                    <Input id={`${field}-limit`} type="number" min={1} max={1000} value={stage.approvalLimit ?? ''} onChange={(event) => edit(stage.id, { approvalLimit: event.target.value ? Number(event.target.value) : null })} />
                  </Field>
                </div>
                {index > 0 && <label className="flex min-h-11 items-center gap-3">
                  <Checkbox checked={stage.requiresPrevApproval} onCheckedChange={(value) => edit(stage.id, { requiresPrevApproval: value === true })} /> Require approval of every earlier stage
                </label>}
              </li>
            })}
          </ol>
          <Button type="button" variant="outline" disabled={stages.length >= 20} onClick={() => onStages([...stages, blankStage(crypto.randomUUID())])}><Plus /> Add stage</Button>
        </div>
      )}
    </SectionCard>
  )
}
