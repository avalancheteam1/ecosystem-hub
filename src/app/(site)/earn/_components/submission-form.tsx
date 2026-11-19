'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { reviseStage, submitStage } from '../_lib/workflow-actions'

export function SubmissionForm({ bountyId, stageId, requiresPullRequest, terms, termsVersion, revision }: {
  bountyId: string; stageId: string; requiresPullRequest: boolean; terms: string; termsVersion: number
  revision?: { id: string; version: number; notes: string; links: string[]; pullRequests: string[] }
}) {
  const router = useRouter()
  const { run, pending } = useActionToast()
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const id = useRef<string | null>(null)
  return (
    <form className="space-y-5" onSubmit={async (event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const lines = (field: string) => String(data.get(field) ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      if (!accepted) { setError('Accept the bounty terms.'); return }
      const evidence = {
        notes: String(data.get('notes') ?? ''), links: lines('links'), pullRequests: lines('pullRequests'),
        accepted: true as const, termsVersion,
      }
      setError('')
      await run(async () => {
        const result = revision
          ? await reviseStage({ bountyId, id: revision.id, version: revision.version, evidence, changeNote: String(data.get('changeNote') ?? '') })
          : await submitStage({ bountyId, stageId, id: id.current ??= crypto.randomUUID(), evidence })
        if (!result.ok) setError(result.error)
        else if (!revision) router.push(`/earn/${bountyId}/receipts/${result.data.id}`)
        return result
      }, revision ? 'Revision received' : 'Submission received')
    }}>
      {requiresPullRequest && <Field id="earn-prs" label="GitHub pull requests" required>
        <Textarea id="earn-prs" name="pullRequests" defaultValue={revision?.pullRequests.join('\n')} required maxLength={5010} rows={3} />
        <p className="text-sm text-fg-muted">Use the repository from the bounty issue. Enter one URL per line.</p>
      </Field>}
      <Field id="earn-links" label="Work links">
        <Textarea id="earn-links" name="links" defaultValue={revision?.links.join('\n')} maxLength={20010} rows={3} />
        <p className="text-sm text-fg-muted">One HTTPS link per line, up to 10.</p>
      </Field>
      <Field id="earn-notes" label="Notes for reviewers"><Textarea id="earn-notes" name="notes" defaultValue={revision?.notes} maxLength={6000} rows={4} /></Field>
      {revision && <Field id="earn-change-note" label="What changed?" required><Textarea id="earn-change-note" name="changeNote" maxLength={6000} required rows={3} /></Field>}
      <details className="rounded-lg border border-line p-4">
        <summary className="flex min-h-11 cursor-pointer items-center">Bounty terms · version {termsVersion}</summary>
        <p className="whitespace-pre-wrap break-words">{terms}</p>
      </details>
      <label className="flex min-h-11 items-center gap-3"><Checkbox checked={accepted} onCheckedChange={(value) => setAccepted(value === true)} /> I accept the bounty terms for this work.</label>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : revision ? 'Save revision' : 'Submit work'}</Button>
    </form>
  )
}
