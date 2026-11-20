'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Pencil, Send, Undo2 } from 'lucide-react'
import { ConfirmButton } from '@/components/confirm-button'
import { FormDialog } from '@/components/form-dialog'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useActionToast } from '@/hooks/use-action-toast'
import { submitToTooling, withdrawFromTooling } from '../_lib/actions'
import { TOOLING_CONSENT } from '../_lib/rules'

export type SubmitRow = {
  projectId: string
  slug: string
  name: string
  versionNumber: number
  listed: number | null
  pending: number | null
  /** Off the list: withdrawn by the team, or removed by a reviewer with their reason. */
  closed: { by: 'team' | 'reviewer'; reason: string | null } | null
  /** The last submission was turned down; `reason` is null when there is none or it is internal. */
  rejected: { reason: string | null } | null
  /** What the current version still needs (empty = can be submitted). */
  problems: string[]
  /** Why there is nothing to submit right now (the current version is already listed or waiting). */
  blocked: string | null
  update: boolean
}

function SubmitButton({ row }: { row: SubmitRow }) {
  const { pending, run } = useActionToast()
  const [consent, setConsent] = useState(false)
  return (
    <FormDialog
      trigger={<Button><Send aria-hidden /> {row.update ? 'Submit update' : 'Submit for review'}</Button>}
      title={`Submit “${row.name}”`}
      description={`Version ${row.versionNumber} is saved as it is now and sent to team1 for review. Later edits don’t change it.`}
      submitLabel="Submit"
      pending={pending}
      onOpenChange={(o) => !o && setConsent(false)}
      onSubmit={() => run(() => submitToTooling({ projectId: row.projectId, consent: consent as true }), 'Sent for review')}
    >
      <label className="flex items-start gap-3 text-sm">
        <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
        <span>{TOOLING_CONSENT}</span>
      </label>
    </FormDialog>
  )
}

export function SubmitList({ rows }: { rows: SubmitRow[] }) {
  const { pending, run } = useActionToast()
  return (
    <ul className="grid gap-5">
      {rows.map((row) => (
        <li key={row.projectId} className="rounded-xl border border-line bg-surface-2 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl">{row.name}</h2>
              <p className="meta mt-1">Version {row.versionNumber}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.listed && <StatusPill tone="success">Listed · version {row.listed}</StatusPill>}
              {row.pending && <StatusPill tone="info">Waiting for review · version {row.pending}</StatusPill>}
              {row.rejected && <StatusPill tone="warning">Last submission not approved</StatusPill>}
              {row.closed?.by === 'team' && <StatusPill>Withdrawn</StatusPill>}
              {row.closed?.by === 'reviewer' && <StatusPill tone="danger">Removed by team1</StatusPill>}
            </div>
          </div>
          {row.closed?.by === 'reviewer' && (
            <p className="mt-4 text-sm text-fg-body">
              team1 took it off /tooling{row.closed.reason ? <>: “{row.closed.reason}”</> : '.'} You can fix the project and submit it again for review.
            </p>
          )}
          {row.rejected?.reason && <p className="mt-4 text-sm text-fg-body">team1: “{row.rejected.reason}”</p>}
          {row.blocked ? (
            <p className="mt-4 text-sm text-fg-muted">{row.blocked}</p>
          ) : row.problems.length > 0 ? (
            <div className="mt-4 text-sm">
              <p className="text-fg-body">Before you can submit, your project needs:</p>
              <ul className="mt-2 list-disc pl-5 text-fg-muted">{row.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!row.blocked && row.problems.length === 0 && <SubmitButton row={row} />}
            <Button asChild variant="outline"><Link href={`/projects/${row.slug}/edit`}><Pencil aria-hidden /> Edit project</Link></Button>
            {(row.listed || row.pending) && (
              <ConfirmButton
                size="default"
                disabled={pending}
                message={`Take “${row.name}” off /tooling${row.pending ? ' and out of review' : ''}? You can submit it again later.`}
                onConfirm={() => run(() => withdrawFromTooling({ projectId: row.projectId }), 'Withdrawn')}
              >
                <Undo2 aria-hidden /> Withdraw
              </ConfirmButton>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
