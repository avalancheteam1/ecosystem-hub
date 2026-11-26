'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { ConfirmButton } from '@/components/confirm-button'
import type { ActionResult } from '@/lib/action'
import {
  inviteCommitteeMember, removeCommitteeMember, resendCommitteeInvitation, revokeCommitteeInvitation, updateCommitteeSettings,
} from '@/app/(site)/grants/_lib/committee-invitation-actions'
import {
  committeeApprovalDescription, committeeApprovalLabel, committeeApprovalRules, maxCommitteeSize, type CommitteeApprovalRule,
} from '@/app/(site)/grants/_lib/committee-policy'

function useInvitationChange() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function run(change: () => Promise<ActionResult<{ mailSent: boolean } | void>>, success: string) {
    return new Promise<boolean>((resolve) => startTransition(async () => {
      try {
        const result = await change()
        if (!result.ok) {
          toast.error(result.error)
          resolve(false)
          return
        }
        if (result.data?.mailSent === false)
          toast.error('Invitation saved. The email could not be sent. Use Resend to try again.')
        else toast.success(success)
        router.refresh()
        resolve(true)
      } catch {
        toast.error('Could not confirm the change. Reload the roster before trying again.')
        resolve(false)
      }
    }))
  }
  return { pending, run }
}

export function CommitteeInviteButton({ disabled }: { disabled: boolean }) {
  const [email, setEmail] = useState('')
  const { pending, run } = useInvitationChange()
  return (
    <FormDialog
      trigger={<Button type="button" className="min-h-11" disabled={disabled}><Plus aria-hidden /> Invite member</Button>}
      title="Invite a Committee member"
      description="They’ll get an email and must sign in with the address you invite. Accepting grants access to submitted applications and evidence. Committee votes apply to shortlisted Mini Grants."
      submitLabel="Send invitation"
      pending={pending}
      onOpenChange={(open) => { if (open) setEmail('') }}
      onSubmit={() => run(() => inviteCommitteeMember({ email }), 'Invitation sent')}
    >
      <Field id="committee-email" label="Email address" requirement="required">
        <Input id="committee-email" type="email" className="min-h-11" value={email}
          onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" maxLength={254} required />
      </Field>
    </FormDialog>
  )
}

export function CommitteePendingControls({ id, mailEnabled }: { id: string; mailEnabled: boolean }) {
  const { pending, run } = useInvitationChange()
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={!mailEnabled || pending}
        onClick={() => void run(() => resendCommitteeInvitation({ id }), 'Invitation resent')}>Resend</Button>
      <ConfirmButton message="Revoke this invitation and free up the Committee seat?" disabled={pending}
        size="default" onConfirm={() => void run(() => revokeCommitteeInvitation({ id }), 'Invitation revoked')}>
        Revoke
      </ConfirmButton>
    </>
  )
}

export function CommitteeSettingsButton({ revision, seatCount, approvalRule, occupied }: {
  revision: number
  seatCount: number
  approvalRule: CommitteeApprovalRule
  occupied: number
}) {
  const [size, setSize] = useState(String(seatCount))
  const [rule, setRule] = useState(approvalRule)
  const { pending, run } = useInvitationChange()
  return (
    <FormDialog
      trigger={<Button type="button" variant="outline">Edit settings</Button>}
      title="Committee settings"
      description="Changes apply when you shortlist a new application."
      submitLabel="Save settings"
      pending={pending}
      onOpenChange={(open) => {
        if (open) { setSize(String(seatCount)); setRule(approvalRule) }
      }}
      onSubmit={() => run(() => updateCommitteeSettings({ revision, seatCount: Number(size), approvalRule: rule }), 'Committee settings saved')}
    >
      <Field id="committee-size" label="Voting seats" requirement="required"
        hint={occupied > 1 ? `Remove members or revoke invitations before reducing below ${occupied} occupied seats.` : undefined}>
        <Input id="committee-size" className="min-h-11" type="number" min={Math.max(1, occupied)}
          max={maxCommitteeSize} step={1} value={size} onChange={(event) => setSize(event.target.value)} required />
      </Field>
      <Field id="committee-rule" label="Approval rule" requirement="required" hint={committeeApprovalDescription[rule]}>
        <NativeSelect id="committee-rule" required value={rule} onChange={(event) => setRule(event.target.value as CommitteeApprovalRule)}>
          {committeeApprovalRules.map((value) => <option key={value} value={value}>{committeeApprovalLabel[value]}</option>)}
        </NativeSelect>
      </Field>
    </FormDialog>
  )
}

export function CommitteeMemberControls({ id }: { id: string }) {
  const { pending, run } = useInvitationChange()
  return (
    <ConfirmButton message="Remove this member from future reviews? They can finish assigned cases while they have Grants review access. Manage that permission separately in Admin → Access." disabled={pending}
      size="default" onConfirm={() => void run(() => removeCommitteeMember({ id }), 'Member removed from future reviews')}>
      Remove
    </ConfirmButton>
  )
}
