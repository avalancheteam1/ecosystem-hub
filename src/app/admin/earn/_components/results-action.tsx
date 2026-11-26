'use client'

import { useState } from 'react'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { MarkdownField } from '@/components/markdown-field'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { announceAwards, cancelEarnBounty, recordEarnReward } from '@/app/(site)/earn/_lib/workflow-actions'

type Props =
  | { action: 'announce'; id: string; revision: number; selected: number }
  | { action: 'cancel'; id: string; revision: number }
  | { action: 'reward'; id: string; bountyId: string }

const labels = {
  announce: {
    title: 'Announce results', submit: 'Publish results', success: 'Results announced',
    description: 'Publish the result and deliver private award receipts. This closes review and fixes the award list.',
  },
  cancel: {
    title: 'Cancel bounty', submit: 'Cancel bounty', success: 'Bounty cancelled',
    description: 'Take the listing offline and close submissions and review. Contributors keep access to their private receipts.',
  },
  reward: {
    title: 'Record external reward', submit: 'Mark rewarded', success: 'External reward recorded',
    description: 'Confirm that the reward was handled off-platform. Keep private payment details out of this note.',
  },
}

export function ResultsAction(props: Props) {
  const [note, setNote] = useState('')
  const { pending, run } = useActionToast()
  const { action, id } = props
  const label = labels[action]
  const required = action !== 'announce' || props.selected === 0
  const noteLabel = action === 'cancel' ? 'Staff cancellation reason' : action === 'reward' ? 'Staff reward note'
    : required ? 'Public reason for no awards' : 'Public announcement (optional)'
  function save() {
    if (props.action === 'cancel') return cancelEarnBounty({ id, revision: props.revision, reason: note })
    if (props.action === 'announce') return announceAwards({ id, revision: props.revision, note })
    return recordEarnReward({ id, bountyId: props.bountyId, note })
  }
  return (
    <FormDialog title={label.title} description={label.description}
      trigger={<Button className="min-h-11" variant={action === 'announce' ? 'default' : 'outline'}>{label.title}</Button>}
      submitLabel={label.submit} pending={pending} onSubmit={() => run(save, label.success)}>
      {action === 'announce' ? (
        <MarkdownField id={`earn-${action}-${id}`} label={noteLabel} value={note} onChange={setNote} maxLength={6000} rows={4} required={required} />
      ) : <Field id={`earn-${action}-${id}`} label={noteLabel} required={required}>
        <Textarea id={`earn-${action}-${id}`} maxLength={6000} required={required} rows={4} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>}
    </FormDialog>
  )
}
