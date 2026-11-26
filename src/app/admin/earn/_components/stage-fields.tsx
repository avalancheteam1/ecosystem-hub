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

export type DraftStage = EarnStageInput & { key: string; id?: string }

export function blankStage(key: string, title = ''): DraftStage {
  return { key, title, deliverables: '', requiresPrevApproval: true, requiresPullRequest: false, submissionPolicy: 'resubmit', approvalLimit: null }
}

export function StageFields({ enabled, onEnabled, stages, onStages, feature, terms, onTermsChange, published, locked, finalCapRequired }: {
  enabled: boolean; onEnabled: (value: boolean) => void; stages: DraftStage[]; onStages: (stages: DraftStage[]) => void; feature: boolean; terms: string; onTermsChange: (value: string) => void
  published: boolean; locked: boolean; finalCapRequired: boolean
}) {
  const prStage = stages.find((stage) => stage.requiresPullRequest)?.key ?? stages.at(-1)?.key
  const hasPublishedStages = published && stages.some((stage) => stage.id)
  function edit(key: string, change: Partial<EarnStageInput>) {
    onStages(stages.map((stage) => stage.key === key ? { ...stage, ...change } : stage))
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
        <Checkbox checked={enabled} disabled={locked || hasPublishedStages} onCheckedChange={(value) => onEnabled(value === true)} /> Accept submissions in the Hub
      </label>
      {locked && <p className="text-sm text-fg-muted">After a submission, you can edit stage titles, deliverables, limits and submission policies. Stage order and requirements stay fixed.</p>}
      {!locked && hasPublishedStages && <p className="text-sm text-fg-muted">Unpublish this bounty to remove saved stages.</p>}
      {enabled && (
        <div className="mt-4 space-y-5">
          <MarkdownField id="earn-terms" label="Additional terms (optional)" value={terms} onChange={onTermsChange} maxLength={6000} rows={4} />
          {feature && <Field id="earn-pr-stage" label="Stage that collects the GitHub pull request">
            <NativeSelect id="earn-pr-stage" value={prStage} disabled={locked} onChange={(event) => onStages(stages.map((stage) => ({ ...stage, requiresPullRequest: stage.key === event.target.value })))}>
              {stages.map((stage, index) => <option key={stage.key} value={stage.key}>{index + 1}. {stage.title || 'Untitled stage'}</option>)}
            </NativeSelect>
          </Field>}
          <ol className="space-y-4">
            {stages.map((stage, index) => {
              const field = `earn-stage-${stage.key}`
              const final = index === stages.length - 1
              const capRequired = final && finalCapRequired
              return <li key={stage.key} className="space-y-4 rounded-lg border border-line bg-surface-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3>Stage {index + 1}{final ? ' · Final' : ''}</h3>
                  {!locked && stages.length > 1 && <div className="flex flex-wrap gap-2">
                    <Button type="button" size="icon" variant="outline" aria-label={`Move stage ${index + 1} up`} disabled={!index} onClick={() => move(index, -1)}><ArrowUp /></Button>
                    <Button type="button" size="icon" variant="outline" aria-label={`Move stage ${index + 1} down`} disabled={index === stages.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
                    {(!published || !stage.id) && <Button type="button" size="icon" variant="outline" aria-label={`Remove stage ${index + 1}`} onClick={() => onStages(stages.filter((item) => item.key !== stage.key))}><Trash2 /></Button>}
                  </div>}
                </div>
                <Field id={`${field}-title`} label="Stage title" required>
                  <Input id={`${field}-title`} value={stage.title} maxLength={160} required onChange={(event) => edit(stage.key, { title: event.target.value })} />
                </Field>
                <MarkdownField id={`${field}-deliverables`} label="Stage deliverables" value={stage.deliverables} onChange={(value) => edit(stage.key, { deliverables: value })} maxLength={6000} rows={2} required={stages.length > 1} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id={`${field}-policy`} label="Submission policy">
                    <NativeSelect id={`${field}-policy`} value={stage.submissionPolicy} onChange={(event) => edit(stage.key, { submissionPolicy: event.target.value as EarnStageInput['submissionPolicy'] })}>
                      <option value="single">One entry</option>
                      <option value="resubmit">Retry after a decision or withdrawal</option>
                      <option value="multiple">Multiple entries</option>
                    </NativeSelect>
                  </Field>
                  <Field id={`${field}-limit`} label={final ? 'Maximum awards' : 'Maximum approvals (optional)'} required={capRequired}>
                    <Input id={`${field}-limit`} type="number" min={1} max={1000} step={1} required={capRequired} value={stage.approvalLimit ?? ''}
                      aria-describedby={final ? `${field}-limit-hint` : undefined}
                      onChange={(event) => edit(stage.key, { approvalLimit: event.target.value ? Number(event.target.value) : null })} />
                    {final && <p id={`${field}-limit-hint`} className="text-sm text-fg-muted">{capRequired ? 'Enter a whole number from 1 to 1,000.' : 'Existing limit may stay blank. To set one, enter a whole number from 1 to 1,000.'}</p>}
                  </Field>
                </div>
                {index > 0 && <label className="flex min-h-11 items-center gap-3">
                  <Checkbox checked={stage.requiresPrevApproval} disabled={locked} onCheckedChange={(value) => edit(stage.key, { requiresPrevApproval: value === true })} /> Require approval of every earlier stage
                </label>}
              </li>
            })}
          </ol>
          {!locked && <Button type="button" variant="outline" disabled={stages.length >= 20} onClick={() => onStages([...stages, blankStage(crypto.randomUUID())])}><Plus /> Add stage</Button>}
        </div>
      )}
    </SectionCard>
  )
}
