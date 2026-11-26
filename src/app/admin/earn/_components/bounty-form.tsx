'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { Field } from '@/components/field'
import { ImageUploadField } from '@/components/image-upload-field'
import { MarkdownField } from '@/components/markdown-field'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useActionToast } from '@/hooks/use-action-toast'
import { utcToZoned } from '@/lib/timezones'
import { createBountyDraft, saveBountyDraft } from '@/app/(site)/earn/_lib/actions'
import { blankStage, StageFields, type DraftStage } from './stage-fields'
import { earnCategories, type EarnStageInput } from '@/app/(site)/earn/_lib/schemas'

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
  terms: string | null
  organizationId: string
  organization: { name: string }
  logoUrl: string | null
  stages: (EarnStageInput & { id: string })[]
}

export function BountyForm({ id: preallocatedId, initial, organizations, published = false, stagesLocked = false }: {
  id: string; initial?: Draft; organizations: { id: string; name: string }[]; published?: boolean; stagesLocked?: boolean
}) {
  const router = useRouter()
  const { pending, run } = useActionToast()
  const [id] = useState(preallocatedId)
  const [deadline, setDeadline] = useState(utcToZoned(initial?.deadline, 'UTC'))
  const [native, setNative] = useState(!initial || initial.stages.length > 0)
  const [stages, setStages] = useState<DraftStage[]>(() => initial?.stages.length
    ? initial.stages.map((stage) => ({ ...stage, key: stage.id }))
    : [blankStage('first', 'Submission')])
  const [feature, setFeature] = useState(Boolean(initial?.hubModule))
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? null)
  const [markdown, setMarkdown] = useState({
    description: initial?.description ?? '',
    deliverables: initial?.deliverables ?? '',
    participation: initial?.participation ?? '',
    terms: initial?.terms ?? '',
  })
  function editMarkdown(field: keyof typeof markdown, value: string) {
    setMarkdown((current) => ({ ...current, [field]: value }))
  }
  const savedFinal = initial?.stages.at(-1)
  const finalCapRequired = !savedFinal || savedFinal.approvalLimit !== null || stages.at(-1)?.id !== savedFinal.id
  const defaultOrganization = organizations.find((org) => org.id === 'team1-central')
  const savedOrganizationUnavailable = initial && !organizations.some((org) => org.id === initial.organizationId)

  return (
    <form className="space-y-6" onSubmit={async (event) => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const text = (name: string) => String(fields.get(name) ?? '').trim()
      const prStage = stages.find((stage) => stage.requiresPullRequest)?.key ?? stages.at(-1)?.key
      const organizationId = text('organizationId')
      const draft = {
        title: text('title'),
        description: markdown.description.trim(),
        deliverables: markdown.deliverables.trim(),
        participation: markdown.participation.trim(),
        participationUrl: text('participationUrl') || null,
        reward: text('reward'),
        category: text('category') as typeof earnCategories[number],
        deadline: toUtcIso(deadline, 'UTC'),
        hubModule: feature ? text('hubModule') : null,
        githubIssueUrl: feature ? text('githubIssueUrl') : null,
        terms: native ? markdown.terms.trim() || null : null,
        organizationId: organizationId && organizationId !== initial?.organizationId ? organizationId : undefined,
        logoUrl,
        stages: native ? stages.map((stage) => ({
          ...(initial && stage.id ? { id: stage.id } : {}),
          title: stage.title, deliverables: stage.deliverables, submissionPolicy: stage.submissionPolicy, approvalLimit: stage.approvalLimit,
          requiresPrevApproval: stage.requiresPrevApproval,
          requiresPullRequest: stagesLocked ? stage.requiresPullRequest : feature && stage.key === prStage,
        })) : [],
      }
      if (initial) {
        await run(() => saveBountyDraft({ id, revision: initial.revision, draft }), published ? 'Bounty saved' : 'Draft saved')
      } else {
        await run(() => createBountyDraft({ id, draft }), 'Draft created', () => router.push(`/admin/earn/${id}`))
      }
    }}>
      <SectionCard title="Bounty brief">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="title" label="Title" required className="sm:col-span-2"><Input id="title" name="title" defaultValue={initial?.title} maxLength={160} required className="h-11" /></Field>
          <Field id="earn-organization" label="Organization" className="sm:col-span-2">
            <NativeSelect id="earn-organization" name="organizationId" defaultValue={initial?.organizationId ?? defaultOrganization?.id ?? ''}>
              {!initial && !defaultOrganization && <option value="">team1 (default)</option>}
              {savedOrganizationUnavailable && <option value={initial.organizationId}>{initial.organization.name} (current)</option>}
              {organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
            </NativeSelect>
          </Field>
          <ImageUploadField kind="earn-logo" ownerId={id} value={logoUrl} onChange={setLogoUrl} label="Bounty logo (optional)" className="sm:col-span-2" />
          <div className="space-y-5 sm:col-span-2">
            <MarkdownField id="description" label="Description" value={markdown.description} onChange={(value) => editMarkdown('description', value)} maxLength={6000} rows={4} required />
            <MarkdownField id="deliverables" label="Deliverables" value={markdown.deliverables} onChange={(value) => editMarkdown('deliverables', value)} maxLength={6000} rows={3} required />
            <MarkdownField id="participation" label="How to participate" hint="Explain where contributors should send their work and include any applicable terms." value={markdown.participation} onChange={(value) => editMarkdown('participation', value)} maxLength={4000} rows={3} required />
          </div>
          <Field id="participation-url" label="Participation link (optional)" className="sm:col-span-2">
            <Input id="participation-url" name="participationUrl" type="url" defaultValue={initial?.participationUrl ?? ''} maxLength={2000} className="h-11" />
          </Field>
          <Field id="reward" label="Reward" required><Input id="reward" name="reward" defaultValue={initial?.reward} maxLength={160} required className="h-11" /></Field>
          <Field id="deadline" label="Deadline" required><DateTimeInput id="deadline" value={deadline} onChange={setDeadline} timeZone="UTC" required /></Field>
          <Field id="category" label="Work type">
            <NativeSelect id="category" name="category" defaultValue={initial?.category ?? 'Development'}>{earnCategories.map((category) => <option key={category}>{category}</option>)}</NativeSelect>
          </Field>
          <Field id="bounty-type" label="Bounty type">
            <NativeSelect id="bounty-type" value={feature ? 'feature' : 'standard'} disabled={stagesLocked} onChange={(event) => setFeature(event.target.value === 'feature')}>
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
      <StageFields enabled={native} onEnabled={setNative} stages={stages} onStages={setStages} feature={feature} terms={markdown.terms} onTermsChange={(value) => editMarkdown('terms', value)} published={published} locked={stagesLocked} finalCapRequired={finalCapRequired} />
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : published ? 'Save changes' : 'Save draft'}</Button>
    </form>
  )
}
