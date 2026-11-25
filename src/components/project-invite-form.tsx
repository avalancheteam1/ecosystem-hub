'use client'

import { useState, useTransition } from 'react'
import { useFormErrors } from '@/hooks/use-form-errors'
import { inviteTargetError } from '@/lib/project-team'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Field } from '@/components/field'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'

export type ProjectInviteAction = (input: { projectId: string; email: string; role: 'reader' | 'writer'; sendEmail: boolean }) => Promise<{ ok: true; data: { invitePath: string } } | { ok: false; error: string }>

/** Shared presentation; callers supply the existing owner-guarded invitation action. */
export function ProjectInviteForm({ projectId, inviteAction, allowReaders = false }: { projectId: string; inviteAction: ProjectInviteAction; allowReaders?: boolean }) {
  const validation = useFormErrors({ target: `teammate-${projectId}` })
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [role, setRole] = useState<'reader' | 'writer'>('writer')
  const [inviteUrl, setInviteUrl] = useState('')
  const [pending, start] = useTransition()
  return <div className="space-y-4">
    <form noValidate className="space-y-3" onSubmit={(e) => {
      e.preventDefault()
      e.stopPropagation()
      const targetError = inviteTargetError(email)
      if (targetError) { validation.fail(targetError, 'target'); return }
      validation.reset()
      start(async () => {
        const result = await inviteAction({ projectId, email, role, sendEmail })
        if (!result.ok) {
          const targetError = ['Use an email instead: this handle does not identify exactly one verified builder', 'That person is already on the team', 'Enter an email or @Telegram handle'].includes(result.error)
          validation.fail(result.error, targetError ? 'target' : 'form')
          return void toast.error(result.error)
        }
        setInviteUrl(new URL(result.data.invitePath, window.location.origin).href)
        setEmail('')
        toast.success(sendEmail ? 'Invite sent and link created' : 'Invite link created')
        router.refresh()
      })
    }}>
      <Field error={validation.errors.target} id={`teammate-${projectId}`} label="Teammate email or Telegram handle"><Input {...validation.props('target')} id={`teammate-${projectId}`} required maxLength={320} placeholder="Email or @Telegram handle" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></Field>
      <label className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={sendEmail} onCheckedChange={(checked) => setSendEmail(checked === true)} /> Send an invite email</label>
      {allowReaders && <Field id={`invite-role-${projectId}`} label="Role"><NativeSelect id={`invite-role-${projectId}`} value={role} onChange={(e) => setRole(e.target.value as 'reader' | 'writer')}><option value="writer">Writer</option><option value="reader">Reader</option></NativeSelect></Field>}
      {validation.errors.form && <p role="alert" className="text-sm text-destructive">{validation.errors.form}</p>}
      <Button type="submit" disabled={pending} className="w-full">{sendEmail ? 'Invite teammate' : 'Create invite link'}</Button>
    </form>
    {inviteUrl && <div className="rounded-lg border border-line p-3 text-sm"><p>Share this link with the invited person. They must sign in with their verified invited email.</p><div className="mt-2 flex min-w-0 items-center gap-2"><Input className="h-11" aria-label="Shareable invite link" readOnly value={inviteUrl} /><CopyButton value={inviteUrl} label="Copy invite link" /></div></div>}
  </div>
}
