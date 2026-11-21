'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { flattenError } from 'zod'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { githubReference } from '../_lib/github'
import { requiredNote, revisionEvidenceSchema } from '../_lib/schemas'
import { stageEvidenceError } from '../_lib/stage-rules'
import { reviseStage, submitStage } from '../_lib/workflow-actions'

const fieldIds = {
  pullRequests: 'earn-prs',
  links: 'earn-links',
  notes: 'earn-notes',
  changeNote: 'earn-change-note',
  accepted: 'earn-terms',
} as const

type SubmissionField = keyof typeof fieldIds

export function SubmissionForm({ bountyId, stageId, requiresPullRequest, githubIssueUrl, terms, termsVersion, revision }: {
  bountyId: string; stageId: string; requiresPullRequest: boolean; githubIssueUrl: string | null; terms: string; termsVersion: number
  revision?: { id: string; version: number; notes: string; links: string[]; pullRequests: string[] }
}) {
  const router = useRouter()
  const { run, pending } = useActionToast()
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SubmissionField, string>>>({})
  const [error, setError] = useState('')
  const id = useRef<string | null>(null)
  const repository = githubIssueUrl ? githubReference(githubIssueUrl, 'issues')?.repository : undefined

  function feedbackProps(field: SubmissionField, hint = false) {
    const fieldId = fieldIds[field]
    const description = [hint && `${fieldId}-hint`, errors[field] && `${fieldId}-error`].filter(Boolean).join(' ')
    return { 'aria-invalid': !!errors[field] || undefined, 'aria-describedby': description || undefined }
  }

  function fieldError(field: SubmissionField) {
    return errors[field] && <p id={`${fieldIds[field]}-error`} className="text-sm text-destructive">{errors[field]}</p>
  }

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
          : await submitStage({ bountyId, stageId, id: id.current ??= crypto.randomUUID(), evidence: validatedEvidence })
        if (!result.ok) setError(result.error)
        else if (!revision) router.push(`/earn/${bountyId}/receipts/${result.data.id}`)
        return result
      }, revision ? 'Revision received' : 'Submission received')
    }}>
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
      <details className="rounded-lg border border-line p-4">
        <summary className="flex min-h-11 cursor-pointer items-center">Bounty terms · version {termsVersion}</summary>
        <p className="whitespace-pre-wrap break-words">{terms}</p>
      </details>
      <div>
        <label htmlFor={fieldIds.accepted} className="flex min-h-11 items-center gap-3">
          <Checkbox id={fieldIds.accepted} required checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} {...feedbackProps('accepted')} />
          I accept the bounty terms for this work.
        </label>
        {fieldError('accepted')}
      </div>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : revision ? 'Save revision' : 'Submit work'}</Button>
    </form>
  )
}
