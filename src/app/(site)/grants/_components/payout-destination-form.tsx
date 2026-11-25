'use client'

import { useId, useState, type FormEvent } from 'react'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { confirmPayoutDestination } from '../_lib/actions'
import { payoutDestinationSchema, syntheticPayout } from '../_lib/schemas'

export function PayoutDestinationForm({ applicationId, revision, awardId }: {
  applicationId: string
  revision: number
  awardId: string
}) {
  const id = useId()
  const { pending, run } = useActionToast()
  const [issue, setIssue] = useState<{ field?: string; message: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const parsed = payoutDestinationSchema.safeParse({
      applicationId, revision, awardId,
      network: fields.get('network'), address: fields.get('address'), confirm: fields.has('confirm'),
    })
    if (!parsed.success) {
      const error = parsed.error.issues[0]
      setIssue({ field: String(error.path[0]), message: error.message })
      return
    }
    setIssue(null)
    await run(async () => {
      const result = await confirmPayoutDestination(parsed.data)
      if (!result.ok) setIssue({ message: result.error })
      return result
    }, 'Test payout address confirmed', () => form.reset())
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-lg space-y-4">
      <p className="text-sm text-fg-body">
        Use a synthetic address for the test token. You cannot change the address after confirmation.
      </p>
      <p className="text-sm text-fg-muted">Project editors and authorized Finance staff can see the confirmed address.</p>
      <Field id={`${id}-network`} label="Test network" required>
        <NativeSelect id={`${id}-network`} name="network" required disabled={pending}
          aria-invalid={issue?.field === 'network'} aria-describedby={issue?.field === 'network' ? `${id}-error` : undefined}>
          <option value="">Select a test network</option>
          <option value={syntheticPayout.network}>{syntheticPayout.networkLabel}</option>
        </NativeSelect>
      </Field>
      <Field id={`${id}-address`} label="Test payout address" required>
        <Textarea id={`${id}-address`} name="address" autoComplete="off" autoCapitalize="off" spellCheck={false} rows={2}
          required disabled={pending} className="resize-none wrap-anywhere font-mono" aria-invalid={issue?.field === 'address'}
          aria-describedby={issue?.field === 'address' ? `${id}-error` : undefined} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="confirm" required disabled={pending} className="size-4 shrink-0 accent-primary"
          aria-invalid={issue?.field === 'confirm'} aria-describedby={issue?.field === 'confirm' ? `${id}-error` : undefined} />
        I checked that the test network and address are correct.
      </label>
      {issue && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{issue.message}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Confirming…' : 'Confirm test payout address'}</Button>
    </form>
  )
}
