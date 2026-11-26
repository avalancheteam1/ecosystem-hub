'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { useActionToast } from '@/hooks/use-action-toast'
import { createRound, setRoundOpen, chooseForRound, snapshotRound } from '../_lib/round-actions'

export function RoundControls({
  mode,
  roundId,
  revision = 0,
  published = false,
  applicationId,
  ownerId,
  owners = [],
}: {
  mode: 'create' | 'open' | 'choice' | 'snapshot'
  roundId?: string
  revision?: number
  published?: boolean
  applicationId?: string
  ownerId: string
  owners?: { value: string; label: string }[]
}) {
  const [name, setName] = useState(''),
    [note, setNote] = useState(''),
    [disposition, setDisposition] = useState<'call' | 'await_evidence' | 'feedback'>('await_evidence')
  const [owner, setOwner] = useState(ownerId)
  const { pending, run } = useActionToast()
  const label =
    mode === 'create'
      ? 'Create closed round'
      : mode === 'open'
        ? published
          ? 'Close applications'
          : 'Open applications'
        : mode === 'choice'
          ? 'Record call priority'
          : 'Record full round snapshot'
  const submit = () =>
    run(
      async () =>
        mode === 'create'
          ? createRound({ name, published: false })
          : mode === 'open'
            ? setRoundOpen({ roundId: roundId!, revision, published: !published })
            : mode === 'choice'
              ? chooseForRound({
                  roundId: roundId!,
                  revision,
                  applicationId: applicationId!,
                  choice: { disposition, ownerId: owner, rationale: note },
                })
              : snapshotRound({ roundId: roundId!, revision, note }),
      'Round record saved',
    )
  return (
    <FormDialog
      title={label}
      description={
        mode === 'snapshot'
          ? 'This freezes every submitted member of this round, including rows hidden by filters. It does not approve funding or send messages.'
          : mode === 'open'
            ? 'Change whether this round accepts new applications. Existing submitted records remain available.'
            : 'Call priority is independent of assessment, funding and communications.'
      }
      trigger={<Button variant={mode === 'choice' ? 'secondary' : 'default'}>{label}</Button>}
      submitLabel={label}
      pending={pending}
      onSubmit={submit}
    >
      {mode === 'create' && (
        <Field id="grant-round-name" label="Round name" requirement="required">
          <Input id="grant-round-name" className="h-11" required value={name} onChange={(e) => setName(e.target.value)} maxLength={10000} />
        </Field>
      )}
      {mode === 'choice' && (
        <Field id="grant-round-owner" label="Selection owner" requirement="required">
          <NativeSelect id="grant-round-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {mode === 'choice' && (
        <Field id="grant-round-disposition" label="Review disposition" requirement="required">
          <NativeSelect
            id="grant-round-disposition"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as typeof disposition)}
          >
            <option value="call">Shortlist for call</option>
            <option value="await_evidence">Await evidence</option>
            <option value="feedback">Feedback</option>
          </NativeSelect>
        </Field>
      )}
      {(mode === 'choice' || mode === 'snapshot') && (
        <Field id="grant-round-note" label="Owner rationale / review note" requirement="required">
          <Textarea id="grant-round-note" required value={note} onChange={(e) => setNote(e.target.value)} maxLength={10000} />
        </Field>
      )}
    </FormDialog>
  )
}
