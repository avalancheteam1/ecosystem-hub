'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flattenError } from 'zod'
import { Field } from '@/components/field'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { formatUtc } from '@/lib/dates'
import { githubReference } from '../_lib/github'
import { requiredNote, revisionEvidenceSchema } from '../_lib/schemas'
import { stageEvidenceError } from '../_lib/stage-rules'
import { reviseStage, submitStage } from '../_lib/workflow-actions'

const fieldIds = {
  previousSubmissionId: 'earn-previous-submission',
  pullRequests: 'earn-prs',
  links: 'earn-links',
  notes: 'earn-notes',
  changeNote: 'earn-change-note',
  accepted: 'earn-terms',
} as const

type SubmissionField = keyof typeof fieldIds
type EligibleParent = { id: string; revision: number; createdAt: Date; stage: { title: string; position: number } }
const chooseParent = 'Choose an approved submission from the previous stage.'
const chooseParentAgain = 'That submission is no longer eligible. Choose another approved submission to continue.'

export function SubmissionForm({ bountyId, stageId, requiresPullRequest, githubIssueUrl, terms, termsVersion, revision, eligibleParents }: {
  bountyId: string; stageId: string; requiresPullRequest: boolean; githubIssueUrl: string | null; terms: string; termsVersion: number
  revision?: { id: string; version: number; notes: string; links: string[]; pullRequests: string[] }
  eligibleParents?: EligibleParent[]
}) {
  const router = useRouter()
  const { run, pending } = useActionToast()
  const [consent, setConsent] = useState({ termsVersion, checked: false })
  const [parentId, setParentId] = useState(() => eligibleParents?.length === 1 ? eligibleParents[0].id : '')
  const [rejectedParents, setRejectedParents] = useState<string[]>([])
  const [errors, setErrors] = useState<Partial<Record<SubmissionField, string>>>({})
  const [error, setError] = useState('')
  const id = useRef<string | null>(null)
  const currentTerms = consent.termsVersion === termsVersion
  const accepted = currentTerms && consent.checked
  if (!currentTerms) setConsent({ termsVersion, checked: false })
  const repository = githubIssueUrl ? githubReference(githubIssueUrl, 'issues')?.repository : undefined
  const availableParents = eligibleParents?.filter((parent) => !rejectedParents.includes(parent.id))
  const selectedParent = availableParents?.some((parent) => parent.id === parentId) ? parentId : ''
  const unavailableParent = !!parentId && !selectedParent
  const noParents = availableParents?.length === 0

  function feedbackProps(field: SubmissionField, hint = false, message = errors[field]) {
    const fieldId = fieldIds[field]
    const description = [hint && `${fieldId}-hint`, message && `${fieldId}-error`].filter(Boolean).join(' ')
    return { 'aria-invalid': !!message || undefined, 'aria-describedby': description || undefined }
  }

  function fieldError(field: SubmissionField) {
    return errors[field] && <p id={`${fieldIds[field]}-error`} className="text-sm text-destructive">{errors[field]}</p>
  }

  const parentError = unavailableParent ? chooseParentAgain : errors.previousSubmissionId

  return (
    <form noValidate className="space-y-5" onSubmit={async (event) => {
      event.preventDefault()
      const form = event.currentTarget
      const data = new FormData(form)
      const lines = (field: string) => String(data.get(field) ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      const evidence = {
        notes: String(data.get('notes') ?? ''), links: lines('links'), pullRequests: lines('pullRequests'),
        accepted, termsVersion,
      }
      const changeNote = String(data.get('changeNote') ?? '')
      const parsed = revisionEvidenceSchema.safeParse(evidence)
      const issues = parsed.success ? {} : flattenError(parsed.error).fieldErrors
      const nextErrors = {
        previousSubmissionId: eligibleParents && !selectedParent ? parentError ?? chooseParent : undefined,
        pullRequests: issues.pullRequests?.[0] ?? stageEvidenceError(requiresPullRequest, githubIssueUrl, evidence.pullRequests) ?? undefined,
        links: issues.links?.[0],
        notes: issues.notes?.[0],
        changeNote: revision && !requiredNote.safeParse(changeNote).success ? 'Describe what changed in this revision.' : undefined,
        accepted: issues.accepted?.[0],
      }
      const firstError = (Object.keys(fieldIds) as SubmissionField[]).find((field) => nextErrors[field])
      setErrors(nextErrors)
      setError('')
      if (firstError) {
        requestAnimationFrame(() => form.querySelector<HTMLElement>(`#${fieldIds[firstError]}`)?.focus())
        return
      }
      if (!parsed.success) {
        setError('Reload the page to get the current bounty terms.')
        return
      }
      const validatedEvidence = { ...evidence, accepted: parsed.data.accepted }
      await run(async () => {
        const result = revision
          ? await reviseStage({ bountyId, id: revision.id, version: revision.version, evidence: validatedEvidence, changeNote })
          : await submitStage({ bountyId, stageId, id: id.current ??= crypto.randomUUID(), evidence: validatedEvidence, ...(selectedParent ? { previousSubmissionId: selectedParent } : {}) })
        if (!result.ok) {
          if (selectedParent && (result.error === chooseParent || result.error === 'This previous submission already has an active continuation.')) {
            setRejectedParents((current) => [...current, selectedParent])
            requestAnimationFrame(() => form.querySelector<HTMLElement>(`#${fieldIds.previousSubmissionId}`)?.focus())
          } else {
            setError(result.error)
          }
        } else if (!revision) {
          router.push(`/earn/${bountyId}/receipts/${result.data.id}`)
        }
        return result
      }, revision ? 'Revision received' : 'Submission received', revision
        ? () => router.replace(`/earn/${bountyId}/receipts/${revision.id}`)
        : undefined)
    }}>
      {availableParents && <Field id={fieldIds.previousSubmissionId} label="Previous submission" required>
        <NativeSelect id={fieldIds.previousSubmissionId} required disabled={noParents} value={selectedParent}
          onChange={(event) => {
            setParentId(event.target.value)
            setErrors((current) => ({ ...current, previousSubmissionId: undefined }))
          }} {...feedbackProps('previousSubmissionId', true, parentError)}>
          <option value="">Choose a submission</option>
          {availableParents.map((parent, index) => <option key={parent.id} value={parent.id}>
            {index + 1}. Stage {parent.stage.position}: {parent.stage.title} · revision {parent.revision} · {formatUtc(parent.createdAt)}
          </option>)}
        </NativeSelect>
        <p id={`${fieldIds.previousSubmissionId}-hint`} className="text-sm text-fg-muted">
          {noParents ? 'Submissions for this stage are locked until an approved submission from the previous stage is available.' : 'Continue work from an approved submission in the previous stage.'}
        </p>
        {parentError && <p id={`${fieldIds.previousSubmissionId}-error`} role={unavailableParent ? 'alert' : undefined} className="text-sm text-destructive">{parentError}</p>}
      </Field>}
      {requiresPullRequest && <Field id={fieldIds.pullRequests} label="GitHub pull requests" required>
        <Textarea id={fieldIds.pullRequests} name="pullRequests" defaultValue={revision?.pullRequests.join('\n')} required maxLength={5010} rows={3} {...feedbackProps('pullRequests', true)} />
        <div id="earn-prs-hint" className="space-y-1 text-sm text-fg-muted">
          <p>Enter one pull request URL per line from {repository ? <strong className="text-fg-body">{repository}</strong> : 'the repository linked in the bounty issue'}.</p>
          {repository && <p className="[overflow-wrap:anywhere]">Example <code>https://github.com/{repository}/pull/123</code></p>}
        </div>
        {fieldError('pullRequests')}
      </Field>}
      <Field id={fieldIds.links} label="Work links">
        <Textarea id={fieldIds.links} name="links" defaultValue={revision?.links.join('\n')} maxLength={20010} rows={3} {...feedbackProps('links', true)} />
        <p id="earn-links-hint" className="text-sm text-fg-muted">One HTTPS link per line, up to 10.</p>
        {fieldError('links')}
      </Field>
      <Field id={fieldIds.notes} label="Notes for reviewers">
        <Textarea id={fieldIds.notes} name="notes" defaultValue={revision?.notes} maxLength={6000} rows={4} {...feedbackProps('notes')} />
        {fieldError('notes')}
      </Field>
      {revision && (
        <Field id={fieldIds.changeNote} label="What changed?" required>
          <Textarea id={fieldIds.changeNote} name="changeNote" maxLength={6000} required rows={3} {...feedbackProps('changeNote')} />
          {fieldError('changeNote')}
        </Field>
      )}
      <details key={termsVersion} open className="rounded-lg border border-line p-4">
        <summary className="flex min-h-11 cursor-pointer items-center">Bounty terms · version {termsVersion}</summary>
        <Markdown className="wrap-anywhere">{terms}</Markdown>
      </details>
      <div>
        <label htmlFor={fieldIds.accepted} className="flex min-h-11 items-center gap-3">
          <Checkbox id={fieldIds.accepted} required checked={accepted} onCheckedChange={(value) => setConsent({ termsVersion, checked: value === true })} {...feedbackProps('accepted')} />
          I accept the bounty terms for this work.
        </label>
        {fieldError('accepted')}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || noParents}>{pending ? 'Saving…' : revision ? 'Save revision' : 'Submit work'}</Button>
    </form>
  )
}
