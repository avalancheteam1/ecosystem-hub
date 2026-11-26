'use client'

import { useId, useRef, useState } from 'react'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { reviewStage } from '@/app/(site)/earn/_lib/workflow-actions'
import { reviewDecisions } from '@/app/(site)/earn/_lib/schemas'

type Decision = typeof reviewDecisions[number]

export function ReviewForm({ bountyId, id, version, alreadyInReview, afterDeadline, final }: {
  bountyId: string; id: string; version: number; alreadyInReview: boolean; afterDeadline: boolean; final: boolean
}) {
  const { pending, run } = useActionToast()
  const [decision, setDecision] = useState<Decision>(alreadyInReview ? afterDeadline ? 'rejected' : 'changes_requested' : 'needs_review')
  const [feedback, setFeedback] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const labels = { needs_review: 'Mark in review', changes_requested: 'Request changes', rejected: 'Reject', approved: 'Approve stage' }
  const needsFeedback = decision === 'changes_requested' || decision === 'rejected'
  const decisions = reviewDecisions.filter((item) => (!final || item !== 'approved') && (!alreadyInReview || item !== 'needs_review') && (!afterDeadline || item !== 'changes_requested'))
  return (
    <FormDialog title="Review submission" description="Save a decision for the current revision. The contributor can see feedback. Internal notes stay with the review team." trigger={<Button>Review submission</Button>} submitLabel="Save decision" pending={pending} onSubmit={() => run(() => reviewStage({ bountyId, id, version, decision, feedback, internalNote }), 'Review saved')}>
      <Field id="earn-review-decision" label="Decision">
        <NativeSelect id="earn-review-decision" value={decision} onChange={(event) => setDecision(event.target.value as Decision)}>
          {decisions.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
        </NativeSelect>
      </Field>
      <Field id="earn-review-feedback" label="Contributor feedback" required={needsFeedback}>
        <Textarea id="earn-review-feedback" maxLength={6000} required={needsFeedback} rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
      </Field>
      <Field id="earn-review-note" label="Internal note">
        <Textarea id="earn-review-note" maxLength={6000} rows={3} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} />
      </Field>
    </FormDialog>
  )
}

export function SelectWinner({ id, bountyId, version, approvalLimit }: { id: string; bountyId: string; version: number; approvalLimit: number }) {
  const { pending, run } = useActionToast()
  return (
    <FormDialog title="Select as winner" description="Select this revision privately for an award. The selection stays private until results are announced."
      trigger={<Button className="min-h-11" variant="outline">Select as winner</Button>} submitLabel="Select as winner" pending={pending}
      onSubmit={() => run(() => reviewStage({ id, bountyId, version, decision: 'approved', feedback: '', internalNote: '' }), 'Winner selected privately')}>
      <p className="text-sm text-fg-body">Final-stage approval limit: {approvalLimit}</p>
    </FormDialog>
  )
}

export function RemoveSelection({ id, bountyId, version, entryLabel }: { id: string; bountyId: string; version: number; entryLabel?: string }) {
  const dialogId = useId()
  const reasonId = `${dialogId}-reason`
  const [reason, setReason] = useState('')
  const [missingReason, setMissingReason] = useState(false)
  const submitting = useRef(false)
  const { pending, run } = useActionToast()

  async function remove() {
    if (pending || submitting.current) return false
    const internalNote = reason.trim()
    if (!internalNote) {
      setMissingReason(true)
      return false
    }
    submitting.current = true
    try {
      return await run(() => reviewStage({ id, bountyId, version, decision: 'needs_review', feedback: '', internalNote }), 'Selection removed')
    } finally {
      submitting.current = false
    }
  }

  return (
    <FormDialog title="Remove selection" formId={`${dialogId}-form`} description="Return this revision to review and release the award slot. The reason is visible to reviewers."
      trigger={<Button id={entryLabel ? undefined : 'remove-selection'} aria-label={entryLabel ? `Remove selection for ${entryLabel}` : undefined} className="min-h-11 scroll-mt-20" variant="outline">Remove selection</Button>}
      submitLabel="Remove selection" pending={pending} onSubmit={remove}>
      <Field id={reasonId} label="Private reason" required>
        <Textarea id={reasonId} maxLength={6000} required rows={3} value={reason}
          aria-invalid={missingReason || undefined} aria-describedby={missingReason ? `${reasonId}-error` : undefined}
          onChange={(event) => {
            setReason(event.target.value)
            setMissingReason(false)
          }} />
        {missingReason && <p id={`${reasonId}-error`} role="alert" className="text-sm text-destructive">Enter a private reason.</p>}
      </Field>
    </FormDialog>
  )
}
