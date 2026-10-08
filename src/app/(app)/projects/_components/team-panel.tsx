'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { initials } from '@/lib/utils'
import { inviteMember, removeMember, revokeInvite, transferOwnership } from '../_lib/actions'

type Member = { userId: string; role: string; user: { name: string; email: string; image: string | null } }
type Invite = { id: string; email: string }

export function TeamPanel({ projectId, members, invites, meId }: { projectId: string; members: Member[]; invites: Invite[]; meId: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pending, start] = useTransition()
  const iAmOwner = members.some((m) => m.userId === meId && m.role === 'owner')
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string, after?: () => void) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) return void toast.error(res.error ?? 'Something went wrong')
      toast.success(msg)
      after?.()
      router.refresh()
    })

  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3">
            <Avatar className="size-9">
              {m.user.image && <AvatarImage src={m.user.image} alt="" />}
              <AvatarFallback className="bg-surface-hover text-xs">{initials(m.user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg-heading">{m.user.name}{m.userId === meId && <span className="text-fg-faint"> (you)</span>}</p>
              <p className="truncate text-xs text-fg-muted">{m.user.email}</p>
            </div>
            {m.role === 'owner' ? (
              <Badge variant="secondary">Owner</Badge>
            ) : iAmOwner ? (
              <div className="flex">
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm(`Make ${m.user.name} the owner? You stay on the team.`) && run(() => transferOwnership({ projectId, userId: m.userId }), 'Ownership transferred')}>Make owner</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => confirm(`Remove ${m.user.name} from the team?`) && run(() => removeMember({ projectId, userId: m.userId }), 'Removed from the team')}>Remove</Button>
              </div>
            ) : m.userId === meId ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm('Leave this project?') && run(() => removeMember({ projectId, userId: meId }), 'You left the project', () => router.push('/projects'))}>Leave</Button>
            ) : null}
          </li>
        ))}
      </ul>
      {invites.length > 0 && (
        <ul className="space-y-2 border-t border-line pt-4">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-fg-muted">{i.email} <span className="text-fg-faint">— invited</span></span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => revokeInvite({ inviteId: i.id }), 'Invite revoked')}>Revoke</Button>
            </li>
          ))}
        </ul>
      )}
      <form className="flex gap-2 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); run(() => inviteMember({ projectId, email }), `Invite sent to ${email}`, () => setEmail('')) }}>
        <Input type="email" required placeholder="teammate@email.com" aria-label="Teammate email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        <Button type="submit" disabled={pending}>Invite</Button>
      </form>
    </div>
  )
}
