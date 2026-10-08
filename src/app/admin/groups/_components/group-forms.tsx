'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useActionToast } from '@/hooks/use-action-toast'
import { slugify } from '@/lib/slug'
import { addGroupMember, createGroup, deleteGroup, removeGroupMember, setGroupLead, updateGroup } from '@/app/(app)/referrals/_lib/group-actions'

type GroupValues = { id?: string; name: string; slug: string }

export function GroupDialog({ group, trigger }: { group?: GroupValues; trigger: React.ReactNode }) {
  const router = useRouter()
  const [name, setName] = useState(group?.name ?? '')
  const [slug, setSlug] = useState(group?.slug ?? '')
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={trigger}
      title={group ? 'Edit group' : 'New group'}
      submitLabel={group ? 'Save' : 'Create'}
      pending={pending}
      onSubmit={() =>
        group?.id
          ? run(() => updateGroup({ id: group.id!, name, slug }), 'Group saved')
          : run(async () => {
              const res = await createGroup({ name, slug })
              if (res.ok) router.push(`/admin/groups/${res.data.id}`)
              return res
            }, 'Group created')
      }
    >
      <Field id="group-name" label="Name">
        <Input id="group-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); if (!group) setSlug(slugify(e.target.value, 41)) }} />
      </Field>
      <Field id="group-slug" label="Slug" hint="Used in the lead page URL /groups/<slug>">
        <Input id="group-slug" value={slug} maxLength={41} onChange={(e) => setSlug(e.target.value)} />
      </Field>
    </FormDialog>
  )
}

export function DeleteGroupButton({ id, name, onboardings }: { id: string; name: string; onboardings: number }) {
  const router = useRouter()
  const { pending, run } = useActionToast()
  return (
    <ConfirmButton
      disabled={pending}
      message={`Delete "${name}"? Its ${onboardings} ${onboardings === 1 ? 'onboarding' : 'onboardings'} disappear from group stats (referrers keep their own counts).`}
      onConfirm={() => run(() => deleteGroup({ id }), 'Group deleted', () => router.push('/admin/groups'))}
    >
      Delete group
    </ConfirmButton>
  )
}

export function AddMemberDialog({ groupId }: { groupId: string }) {
  const [email, setEmail] = useState('')
  const [isLead, setIsLead] = useState(false)
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={<Button size="sm"><Plus aria-hidden /> Add member</Button>}
      title="Add member"
      description="The person needs a hub account."
      submitLabel="Add"
      pending={pending}
      onOpenChange={(o) => { if (o) { setEmail(''); setIsLead(false) } }}
      onSubmit={() => run(() => addGroupMember({ groupId, email, isLead }), 'Member added')}
    >
      <Field id="member-email" label="Email">
        <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox checked={isLead} onCheckedChange={(c) => setIsLead(c === true)} /> Lead — sees this group&apos;s onboardings
      </label>
    </FormDialog>
  )
}

export function MemberActions({ groupId, userId, isLead }: { groupId: string; userId: string; isLead: boolean }) {
  const { pending, run } = useActionToast()
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setGroupLead({ groupId, userId, isLead: !isLead }), 'Saved')}>
        {isLead ? 'Remove lead' : 'Make lead'}
      </Button>
      <ConfirmButton disabled={pending} message="Remove this member? Their past onboardings stay in the group stats." onConfirm={() => run(() => removeGroupMember({ groupId, userId }), 'Member removed')}>
        Remove
      </ConfirmButton>
    </div>
  )
}
