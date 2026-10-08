'use client'

import { reviewRegistration, setInviteLink, setRequireApproval } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useActionToast } from '@/hooks/use-action-toast'

/** Approval toggle + the auto-approve invite link (only meaningful while approval is on). */
export function ApprovalSettings({ hackathonId, requireApproval, inviteUrl }: { hackathonId: string; requireApproval: boolean; inviteUrl: string | null }) {
  const { pending, run } = useActionToast()
  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={requireApproval}
            disabled={pending}
            onCheckedChange={(c) => run(() => setRequireApproval({ hackathonId, requireApproval: c === true }), c === true ? 'Registrations now need approval' : 'Registrations are accepted automatically')}
          />
          Approve registrations manually
        </label>
        <p className="text-xs text-fg-faint">Off: everyone who registers is in. On: registrations wait for an organiser below. Switching off doesn&apos;t approve waiting ones.</p>
      </div>
      {requireApproval && (
        <div className="space-y-3">
          <p className="text-sm text-fg-heading">Invite link</p>
          <p className="text-xs text-fg-faint">Anyone registering through this link is approved automatically. Share it only with people you want in.</p>
          {inviteUrl ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 py-1 pr-1 pl-3">
                <code className="min-w-0 flex-1 truncate text-sm">{inviteUrl}</code>
                <CopyButton value={inviteUrl} label="Copy invite link" />
              </div>
              <div className="flex flex-wrap gap-2">
                <ConfirmButton disabled={pending} message="Create a new link? The current one stops working." onConfirm={() => run(() => setInviteLink({ hackathonId, enabled: true }), 'New invite link created')}>New link</ConfirmButton>
                <ConfirmButton disabled={pending} message="Turn off the invite link? It stops working." onConfirm={() => run(() => setInviteLink({ hackathonId, enabled: false }), 'Invite link turned off')}>Turn off</ConfirmButton>
              </div>
            </>
          ) : (
            <div><Button variant="outline" disabled={pending} onClick={() => run(() => setInviteLink({ hackathonId, enabled: true }), 'Invite link created')}>Create invite link</Button></div>
          )}
        </div>
      )}
    </div>
  )
}

export function ReviewButtons({ hackathonId, participantId, status }: { hackathonId: string; participantId: string; status: string }) {
  const { pending, run } = useActionToast()
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewRegistration({ hackathonId, participantId, approve: true }), 'Approved')}>Approve</Button>
      {status === 'pending' && <ConfirmButton disabled={pending} message="Reject this registration? They can't re-register (unless you send them the invite link)." onConfirm={() => run(() => reviewRegistration({ hackathonId, participantId, approve: false }), 'Rejected')}>Reject</ConfirmButton>}
    </div>
  )
}
