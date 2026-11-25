'use client'

import { useState } from 'react'
import { useFormErrors } from '@/hooks/use-form-errors'
import { teamCorrectionSchema } from '@/app/(site)/events/_lib/hackathons/schemas'
import { correctSubmissionTeam } from '@/app/(site)/events/_lib/hackathons/team-actions'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import type { SubmittedMember } from '@/lib/submission-team'

export function SubmissionTeamEditor({ hackathonId, entryId, members }: { hackathonId: string; entryId: string; members: SubmittedMember[] }) {
  const empty = { addTarget: '', removeUserId: '', reason: '' }
  const [value, setValue] = useState(empty)
  const { pending, run } = useActionToast()
  const validation = useFormErrors({ addTarget: 'team-add', removeUserId: 'team-remove', reason: 'team-reason' })
  return (
    <FormDialog noValidate
      trigger={<Button variant="outline">Correct submitted team</Button>}
      title="Correct this submitted team"
      description="Available after the deadline too. Updates this round's submitted team and keeps a visible history. Project access and the submitted project version stay the same. Added builders must already be registered."
      submitLabel="Save team correction"
      pending={pending}
      onOpenChange={(open) => { if (open) { setValue(empty); validation.reset() } }}
      onSubmit={() => {
        const input = { hackathonId, entryId, ...value }
        if (!validation.validate(teamCorrectionSchema, input)) return false
        return run(async () => {
          const result = await correctSubmissionTeam(input)
          if (!result.ok) validation.fail(`${result.error} Check the latest settings and try again.`)
          return result
        }, 'Submitted team corrected')
      }}
    >
      {validation.errors.form && <p role="alert" className="text-sm text-destructive">{validation.errors.form}</p>}
      <Field error={validation.errors.addTarget} id="team-add" label="Add a registered builder (Optional)" hint="Use an email or @Telegram handle. To replace someone, also select the member to remove.">
        <Input {...validation.props('addTarget')} id="team-add" className="h-11" value={value.addTarget} onChange={(e) => setValue({ ...value, addTarget: e.target.value })} maxLength={320} />
      </Field>
      <Field error={validation.errors.removeUserId} id="team-remove" label="Remove or replace a member (Optional)">
        <NativeSelect {...validation.props('removeUserId')} id="team-remove" value={value.removeUserId} onChange={(e) => setValue({ ...value, removeUserId: e.target.value })}>
          <option value="">Keep all current members</option>
          {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
        </NativeSelect>
      </Field>
      <Field error={validation.errors.reason} id="team-reason" label="Reason" required hint="Shown in the submission's correction history.">
        <Textarea {...validation.props('reason')} id="team-reason" value={value.reason} onChange={(e) => setValue({ ...value, reason: e.target.value })} maxLength={500} required />
      </Field>
    </FormDialog>
  )
}
