'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { MarkdownField } from '@/components/markdown-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { announceAwards, cancelEarnBounty, recordEarnReward } from '@/app/(site)/earn/_lib/workflow-actions'

type Props =
  | { action: 'announce'; id: string; revision: number; selected: number; deadline: string; early: boolean }
  | { action: 'cancel'; id: string; revision: number }
  | { action: 'reward'; id: string; bountyId: string }

const labels = {
  announce: {
    title: 'Announce results', submit: 'Publish results', success: 'Results announced',
    description: 'Publish the result and show private award details on awarded submissions. This closes review and fixes the award list.',
  },
  cancel: {
    title: 'Cancel bounty', submit: 'Cancel bounty', success: 'Bounty cancelled',
    description: 'Take the listing offline and close submissions and review. Contributors keep access to their private submissions.',
  },
  reward: {
    title: 'Record external reward', submit: 'Mark rewarded', success: 'External reward recorded',
    description: 'Confirm that the reward was handled off-platform. Keep private payment details out of this note.',
  },
}

export function ResultsAction(props: Props) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [confirmation, setConfirmation] = useState<number | null>(null)
  const [closeNow, setCloseNow] = useState(false)
  const [error, setError] = useState('')
  const { pending, run } = useActionToast()
  const { action, id } = props
  const label = labels[action]
  const required = action !== 'announce' || props.selected === 0
  const early = props.action === 'announce' && props.early
  const stale = props.action === 'announce' && confirmation !== null && props.revision !== confirmation
  const closeId = `earn-close-now-${id}`
  const noteLabel = action === 'cancel' ? 'Staff cancellation reason' : action === 'reward' ? 'Staff reward note'
    : required ? 'Public reason for no awards' : 'Public announcement (optional)'
  function save() {
    if (props.action === 'cancel') return cancelEarnBounty({ id, revision: props.revision, reason: note })
    if (props.action === 'announce') return announceAwards({ id, revision: props.revision, note, ...(early && closeNow ? { closeNow: true } : {}) })
    return recordEarnReward({ id, bountyId: props.bountyId, note })
  }
  return (
    <FormDialog title={label.title} description={label.description}
      trigger={<Button className="min-h-11" variant={action === 'announce' ? 'default' : 'outline'}>{label.title}</Button>}
      submitLabel={label.submit} pending={pending}
      onOpenChange={(open) => {
        if (props.action !== 'announce') return
        setConfirmation(open ? props.revision : null)
        setCloseNow(false)
        setError('')
      }}
      onSubmit={() => {
        if (props.action !== 'announce') return run(save, label.success)
        if (stale) return false
        if (early && !closeNow) {
          setError('Confirm closing submissions now to announce early.')
          return false
        }
        if (required && !note.trim()) {
          setError('Explain why there are no award recipients.')
          return false
        }
        setError('')
        return run(async () => {
          const result = await save()
          if (!result.ok) {
            setError(result.error)
            router.refresh()
          }
          return result
        }, label.success)
      }}>
      {action === 'announce' ? (
        <>
          <p className="text-sm text-fg-body">{props.selected} privately selected · Scheduled deadline {props.deadline}</p>
          {early && <label htmlFor={closeId} className="flex min-h-11 items-center gap-3">
            <Checkbox id={closeId} required checked={closeNow} onCheckedChange={(checked) => setCloseNow(checked === true)} />
            Close submissions now, before the scheduled deadline.
          </label>}
          <MarkdownField id={`earn-${action}-${id}`} label={noteLabel} value={note} onChange={setNote} maxLength={6000} rows={4} required={required} />
          {(stale || error) && <p role="alert" className="text-sm text-destructive">
            {stale ? 'The bounty changed. Close and reopen this dialog to review the latest results before announcing.' : error}
          </p>}
        </>
      ) : <Field id={`earn-${action}-${id}`} label={noteLabel} required={required}>
        <Textarea id={`earn-${action}-${id}`} maxLength={6000} required={required} rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>}
    </FormDialog>
  )
}
