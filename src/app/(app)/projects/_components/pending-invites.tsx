'use client'

import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { acceptInviteById } from '../_lib/actions'
import { PROJECT_ROLES, type ProjectRole } from '../_lib/rules'

type Invite = { id: string; role: string; project: { currentVersion: { name: string } | null } }

/** Open invites to my email, accepted in place (the emailed link keeps working too). */
export function PendingInvites({ invites }: { invites: Invite[] }) {
  const { pending, run } = useActionToast()
  if (!invites.length) return null
  return (
    <SectionCard title="Project invites" description="Teams that invited you. Accept to join.">
      <ul className="divide-y divide-line">
        {invites.map((i) => (
          <li key={i.id} className="flex min-h-12 flex-wrap items-center justify-between gap-3 py-2">
            <span className="text-fg-heading">{i.project.currentVersion?.name ?? 'A project'} <span className="text-sm text-fg-muted">- as {(PROJECT_ROLES[i.role as ProjectRole]?.label ?? i.role).toLowerCase()}</span></span>
            <Button size="sm" disabled={pending} onClick={() => run(() => acceptInviteById({ inviteId: i.id }), 'You joined the team')}>Accept</Button>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
