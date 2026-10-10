'use client'

import { createContext, useContext, useState } from 'react'
import { reviewRegistration, setInviteLink, setRequireApproval } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { AnswerList, type AnswerField, type Answers } from '@/components/answer-fields'
import { ConfirmButton } from '@/components/confirm-button'
import { CopyButton } from '@/components/copy-button'
import { QrCodeDialog } from '@/components/qr-code-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
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
                <QrCodeDialog value={inviteUrl} filename="team1-hackathon-invite" title="Invite link QR code" label="QR code for invite link" />
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
      <Button size="sm" disabled={pending} onClick={() => run(() => reviewRegistration({ hackathonId, participantIds: [participantId], approve: true }), 'Approved')}>Approve</Button>
      {status === 'pending' && <ConfirmButton disabled={pending} message="Reject this registration? They can't re-register (unless you send them the invite link)." onConfirm={() => run(() => reviewRegistration({ hackathonId, participantIds: [participantId], approve: false }), 'Rejected')}>Reject</ConfirmButton>}
    </div>
  )
}

/** All answers of one registration - the table cells are truncated. */
export function RegistrationDetails({ name, email, fields, answers }: { name: string; email: string; fields: AnswerField[]; answers: Answers }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">View</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{email}</DialogDescription>
        </DialogHeader>
        <AnswerList fields={fields} answers={answers} />
      </DialogContent>
    </Dialog>
  )
}

const Selection = createContext<{ selected: string[]; toggle: (id: string, on: boolean) => void } | null>(null)

/** Wraps the registrations table: row checkboxes (`SelectRow`) + "select all on this page" + approve selected. */
export function BulkApprove({ hackathonId, ids, children }: { hackathonId: string; ids: string[]; children: React.ReactNode }) {
  const [picked, setPicked] = useState<string[]>([])
  const { pending, run } = useActionToast()
  // Only rows on the current page count - paging or approving drops the rest.
  const selected = picked.filter((id) => ids.includes(id))
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))
  const all = ids.length > 0 && selected.length === ids.length
  return (
    <Selection.Provider value={{ selected, toggle }}>
      <div className="mb-3 flex min-h-11 flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox checked={all ? true : selected.length ? 'indeterminate' : false} disabled={!ids.length} onCheckedChange={(c) => setPicked(c === true ? ids : [])} />
          Select all on this page
        </label>
        {selected.length > 0 && (
          <Button size="sm" disabled={pending} onClick={() => run(() => reviewRegistration({ hackathonId, participantIds: selected, approve: true }), `Approved ${selected.length}`, () => setPicked([]))}>
            Approve {selected.length}
          </Button>
        )}
      </div>
      {children}
    </Selection.Provider>
  )
}

export function SelectRow({ id, label }: { id: string; label: string }) {
  const ctx = useContext(Selection)!
  // the label pads the small box to a 44px touch target
  return (
    <label className="-m-3 inline-grid size-11 cursor-pointer place-items-center">
      <Checkbox aria-label={`Select ${label}`} checked={ctx.selected.includes(id)} onCheckedChange={(c) => ctx.toggle(id, c === true)} />
    </label>
  )
}
