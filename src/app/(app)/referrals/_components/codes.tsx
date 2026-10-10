'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CopyButton } from '@/components/copy-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { QrCodeDialog } from '@/components/qr-code-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useActionToast } from '@/hooks/use-action-toast'
import { createReferralCode, updateReferralCode } from '../_lib/actions'

export type CodeRow = { id: string; code: string; label: string | null; active: boolean; onboardings: number }

const linkFor = (siteUrl: string, code: string) => `${siteUrl}/?ref=${code}`

export function CreateCodeDialog({ disabled }: { disabled: boolean }) {
  const [label, setLabel] = useState('')
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={<Button disabled={disabled}><Plus aria-hidden /> New code</Button>}
      title="New referral code"
      description="You get a random code. Add a label to remember where you share it."
      submitLabel="Create"
      pending={pending}
      onOpenChange={(o) => { if (o) setLabel('') }}
      onSubmit={() => run(() => createReferralCode({ label }), 'Code created')}
    >
      <Field id="ref-label" label="Label" hint="Only you see it, e.g. where you share this link">
        <Input id="ref-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
      </Field>
    </FormDialog>
  )
}

function EditLabelDialog({ row }: { row: CodeRow }) {
  const [label, setLabel] = useState(row.label ?? '')
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={<Button size="sm" variant="ghost">Edit</Button>}
      title={`Edit ${row.code}`}
      submitLabel="Save"
      pending={pending}
      onOpenChange={(o) => { if (o) setLabel(row.label ?? '') }}
      onSubmit={() => run(() => updateReferralCode({ id: row.id, label, active: row.active }), 'Saved')}
    >
      <Field id={`label-${row.id}`} label="Label">
        <Input id={`label-${row.id}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
      </Field>
    </FormDialog>
  )
}

export function CodeTable({ codes, siteUrl }: { codes: CodeRow[]; siteUrl: string }) {
  const { pending, run } = useActionToast()
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Onboardings</TableHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.map((c) => (
            <TableRow key={c.id} className={c.active ? undefined : 'opacity-60'}>
              <TableCell><code className="text-fg-heading">{c.code}</code>{!c.active && <span className="ml-2 text-xs text-fg-faint">inactive</span>}</TableCell>
              <TableCell className="text-fg-muted">{c.label ?? '-'}</TableCell>
              <TableCell className="text-right tabular-nums">{c.onboardings}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                {c.active && <CopyButton value={linkFor(siteUrl, c.code)} label="Copy link" />}
                {c.active && <QrCodeDialog value={linkFor(siteUrl, c.code)} filename={`team1-ref-${c.code}`} title={`QR code · ${c.code}`} label="QR code for this link" />}
                <EditLabelDialog row={c} />
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => updateReferralCode({ id: c.id, label: c.label ?? '', active: !c.active }), c.active ? 'Deactivated' : 'Activated')}>
                  {c.active ? 'Deactivate' : 'Activate'}
                </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
