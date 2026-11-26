'use client'

import { useState } from 'react'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { withdrawStage } from '../_lib/workflow-actions'

export function WithdrawButton({ bountyId, id, version }: { bountyId: string; id: string; version: number }) {
  const [reason, setReason] = useState('')
  const { pending, run } = useActionToast()
  return (
    <FormDialog title="Withdraw submission" description="This submission leaves the review queue. You can still view the submission and its history." trigger={<Button variant="outline">Withdraw submission</Button>} submitLabel="Withdraw" pending={pending} onSubmit={() => run(() => withdrawStage({ bountyId, id, version, reason }), 'Submission withdrawn')}>
      <Field id="withdraw-reason" label="Reason" required><Textarea id="withdraw-reason" value={reason} maxLength={6000} required onChange={(event) => setReason(event.target.value)} /></Field>
    </FormDialog>
  )
}
