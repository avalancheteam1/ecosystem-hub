'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Markdown } from '@/components/markdown'
import { MarkdownField } from '@/components/markdown-field'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { useActionToast } from '@/hooks/use-action-toast'
import { addMilestone, deleteMilestone, updateMilestone } from '../_lib/actions'
import { MAX_MILESTONES, MILESTONE_STATUS, type MilestoneStatus } from '../_lib/rules'

export type Milestone = { id: string; title: string; description: string | null; targetDate: string; status: MilestoneStatus; doneAt?: Date | null }
type Draft = Omit<Milestone, 'id' | 'doneAt'>

const EMPTY: Draft = { title: '', description: '', targetDate: '', status: 'planned' }
// Calendar days (YYYY-MM-DD) are zone-less: format them in UTC so every viewer sees the same day.
const day = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function MilestoneDialog({ trigger, title, initial, pending, onSubmit }: { trigger: React.ReactNode; title: string; initial: Draft; pending?: boolean; onSubmit: (m: Draft) => Promise<boolean> | boolean }) {
  const [m, setM] = useState(initial)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setM((p) => ({ ...p, [k]: v }))
  return (
    <FormDialog trigger={trigger} title={title} submitLabel="Save milestone" pending={pending} onOpenChange={(o) => o && setM(initial)} onSubmit={() => onSubmit(m)}>
      <Field id="ms-title" label="Title" required>
        <Input id="ms-title" value={m.title} onChange={(e) => set('title', e.target.value)} required maxLength={120} placeholder="e.g. Mainnet launch" className="h-11" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ms-date" label="Target date" required>
          <Input id="ms-date" type="date" value={m.targetDate} onChange={(e) => set('targetDate', e.target.value)} required className="h-11" />
        </Field>
        <Field id="ms-status" label="Status">
          <NativeSelect id="ms-status" value={m.status} onChange={(e) => set('status', e.target.value as MilestoneStatus)}>
            {Object.entries(MILESTONE_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <MarkdownField id="ms-desc" label="Description" hint="What it includes, how you'll know it's done. Markdown works." value={m.description ?? ''} onChange={(t) => set('description', t)} maxLength={2000} rows={5} />
    </FormDialog>
  )
}

/** Milestone list with add / edit / delete (none when readOnly). Persistence is the caller's: live actions or local form state. */
export function MilestoneList({ items, pending, readOnly, onSave, onDelete }: { items: Milestone[]; pending?: boolean; readOnly?: boolean; onSave: (m: Draft, id?: string) => Promise<boolean> | boolean; onDelete: (id: string) => void }) {
  const sorted = [...items].sort((a, b) => a.targetDate.localeCompare(b.targetDate))
  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-sm text-fg-muted">{readOnly ? 'No milestones yet.' : 'No milestones yet. Add what you plan to ship and by when.'}</p>
      ) : (
        // Timeline like the start page's "Your path": a line with one dot per milestone (filled = done).
        <ol className="relative space-y-6">
          <span aria-hidden className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-brand via-brand/60 to-brand/10" />
          {sorted.map((m) => (
            <li key={m.id} className="relative pl-8">
              <span aria-hidden className={`absolute top-1 left-0 grid size-[15px] place-items-center rounded-full border bg-surface-0 ${m.status === 'dropped' ? 'border-line' : 'border-brand'}`}>
                {m.status === 'done' ? <span className="size-[9px] rounded-full bg-brand" /> : m.status === 'in_progress' ? <span className="size-[5px] rounded-full bg-brand" /> : null}
              </span>
              <p className="meta">{m.status === 'done' && m.doneAt ? `Done ${day(m.doneAt)} · planned ${day(m.targetDate)}` : day(m.targetDate)}</p>
              <div className="mt-1 flex items-start justify-between gap-2">
                <h3 className={`min-w-0 text-base leading-tight ${m.status === 'dropped' ? 'text-fg-muted line-through' : ''}`}>{m.title}</h3>
                <StatusPill tone={MILESTONE_STATUS[m.status]?.tone ?? 'neutral'} className="shrink-0">{MILESTONE_STATUS[m.status]?.label ?? m.status}</StatusPill>
              </div>
              {m.description && <Markdown className="mt-1.5 text-sm text-fg-muted">{m.description}</Markdown>}
              {!readOnly && <div className="mt-1 flex gap-1 -ml-3">
                <MilestoneDialog
                  title="Edit milestone"
                  initial={{ title: m.title, description: m.description, targetDate: m.targetDate, status: m.status }}
                  pending={pending}
                  onSubmit={(d) => onSave(d, m.id)}
                  trigger={<Button type="button" variant="ghost" size="sm"><Pencil aria-hidden /> Edit</Button>}
                />
                <ConfirmButton message={`Delete the milestone “${m.title}”?`} disabled={pending} onConfirm={() => onDelete(m.id)}>Delete</ConfirmButton>
              </div>}
            </li>
          ))}
        </ol>
      )}
      {!readOnly && items.length < MAX_MILESTONES && (
        <MilestoneDialog title="Add milestone" initial={EMPTY} pending={pending} onSubmit={(d) => onSave(d)} trigger={<Button type="button" variant="outline" size="sm"><Plus aria-hidden /> Add milestone</Button>} />
      )}
    </div>
  )
}

/** Live milestones of an existing project: every change saves immediately (like the team). */
export function MilestonesPanel({ projectId, milestones, readOnly }: { projectId: string; milestones: Milestone[]; readOnly?: boolean }) {
  const { pending, run } = useActionToast()
  return (
    <MilestoneList
      items={milestones}
      pending={pending}
      readOnly={readOnly}
      onSave={(m, id) => (id ? run(() => updateMilestone({ id, ...m, description: m.description ?? '' }), 'Milestone saved') : run(() => addMilestone({ projectId, ...m, description: m.description ?? '' }), 'Milestone added'))}
      onDelete={(id) => run(() => deleteMilestone({ id }), 'Milestone deleted')}
    />
  )
}
