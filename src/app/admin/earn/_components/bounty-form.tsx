'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { Field } from '@/components/field'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { utcToZoned } from '@/lib/timezones'
import { createBountyDraft, saveBountyDraft } from '@/app/(site)/earn/_lib/actions'
import { blankStage, StageFields, type DraftStage } from './stage-fields'
import { earnCategories } from '@/app/(site)/earn/_lib/schemas'

type Draft = {
  revision: number
  title: string
  description: string
  deliverables: string
  participation: string
  participationUrl: string | null
  category: string
  reward: string
  deadline: Date
  hubModule: string | null
  githubIssueUrl: string | null
  terms?: string | null
  stages?: DraftStage[]
}

export function BountyForm({ id, initial }: { id: string; initial?: Draft }) {
  const router = useRouter()
  const { pending, run } = useActionToast()
  const [deadline, setDeadline] = useState(utcToZoned(initial?.deadline, 'UTC'))
  const [native, setNative] = useState(Boolean(initial?.stages?.length))
  const [stages, setStages] = useState(() => initial?.stages?.length ? initial.stages : [blankStage('first', 'Submission')])
  const [feature, setFeature] = useState(Boolean(initial?.hubModule))
  return (
    <form className="space-y-6" onSubmit={async (event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const text = (name: string) => String(fields.get(name) ?? '').trim()
      const prStage = stages.find((stage) => stage.requiresPullRequest)?.id ?? stages.at(-1)?.id
      const draft = {
        title: text('title'),
        description: text('description'),
        deliverables: text('deliverables'),
        participation: text('participation'),
        participationUrl: text('participationUrl') || null,
        reward: text('reward'),
        category: text('category') as typeof earnCategories[number],
        deadline: toUtcIso(deadline, 'UTC'),
        hubModule: feature ? text('hubModule') : null,
        githubIssueUrl: feature ? text('githubIssueUrl') : null,
        terms: native ? text('terms') : null,
        stages: native ? stages.map((stage) => ({
          title: stage.title, deliverables: stage.deliverables, submissionPolicy: stage.submissionPolicy, approvalLimit: stage.approvalLimit,
          requiresPrevApproval: stage.requiresPrevApproval, requiresPullRequest: feature && stage.id === prStage,
        })) : [],
      }
      if (initial) {
        await run(() => saveBountyDraft({ id, revision: initial.revision, draft }), 'Draft saved')
      } else {
        await run(() => createBountyDraft({ id, draft }), 'Draft created', () => router.push(`/admin/earn/${id}`))
      }
    }}>
      <SectionCard title="Bounty brief">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="title" label="Title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={initial?.title} maxLength={160} required className="h-11" /></Field>
          <Field id="description" label="Description" required className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={initial?.description} maxLength={6000} rows={4} required /></Field>
          <Field id="deliverables" label="Deliverables" required className="sm:col-span-2"><Textarea id="deliverables" name="deliverables" defaultValue={initial?.deliverables} maxLength={6000} rows={3} required /></Field>
          <Field id="participation" label="How to participate" required className="sm:col-span-2">
            <Textarea id="participation" name="participation" defaultValue={initial?.participation} maxLength={4000} rows={3} required />
            <p className="text-sm text-fg-muted">Explain where contributors should send their work and include any applicable terms.</p>
          </Field>
          <Field id="participation-url" label="Participation link (optional)" className="sm:col-span-2">
            <Input id="participation-url" name="participationUrl" type="url" defaultValue={initial?.participationUrl ?? ''} maxLength={2000} className="h-11" />
          </Field>
          <Field id="reward" label="Reward" required><Input id="reward" name="reward" defaultValue={initial?.reward} maxLength={160} required className="h-11" /></Field>
          <Field id="deadline" label="Deadline" required><DateTimeInput id="deadline" value={deadline} onChange={setDeadline} timeZone="UTC" required /></Field>
          <Field id="category" label="Work type">
            <NativeSelect id="category" name="category" defaultValue={initial?.category ?? 'Development'}>{earnCategories.map((category) => <option key={category}>{category}</option>)}</NativeSelect>
          </Field>
          <Field id="bounty-type" label="Bounty type">
            <NativeSelect id="bounty-type" value={feature ? 'feature' : 'standard'} onChange={(event) => setFeature(event.target.value === 'feature')}>
              <option value="standard">Standard bounty</option>
              <option value="feature">Hub feature</option>
            </NativeSelect>
          </Field>
          {feature && (
            <>
              <Field id="hub-module" label="Hub module" required>
                <Input id="hub-module" name="hubModule" defaultValue={initial?.hubModule ?? ''} maxLength={160} required className="h-11" />
              </Field>
              <Field id="github-issue" label="Public GitHub issue" required>
                <Input id="github-issue" name="githubIssueUrl" type="url" defaultValue={initial?.githubIssueUrl ?? ''} maxLength={500} required className="h-11" />
                <p className="text-sm text-fg-muted">Verify the issue is accessible while signed out and approved for public sharing.</p>
              </Field>
            </>
          )}
        </div>
      </SectionCard>
      <StageFields enabled={native} onEnabled={setNative} stages={stages} onStages={setStages} feature={feature} terms={initial?.terms} />
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft'}</Button>
    </form>
  )
}
