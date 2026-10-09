'use client'

import { useState } from 'react'
import { Plus, Shuffle, X } from 'lucide-react'
import { applyAssignment, assignAllToEntry, assignJudge, previewAssignment, setAdvanced, setJudgingClosed, unassignJudge } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useActionToast } from '@/hooks/use-action-toast'

/** Random stages only: draw with the stage's settings (set under Stages), preview, apply. */
export function AssignPanel({ hackathonId, stageId, perEntry, hasAssignments }: { hackathonId: string; stageId: string; perEntry: number | null; hasAssignments: boolean }) {
  const [preview, setPreview] = useState<{ seed: string; total: number; load: { judge: string; count: number }[] } | null>(null)
  const { pending, run } = useActionToast()
  const draw = () =>
    run(async () => {
      const res = await previewAssignment({ hackathonId, stageId })
      if (res.ok) setPreview(res.data)
      return res
    }, 'Preview ready')
  return (
    <div className="space-y-4">
      <p className="text-sm">Random, balanced — {perEntry ?? '?'} judge{perEntry === 1 ? '' : 's'} per submission <span className="text-fg-faint">(change under Stages)</span></p>
      <p className="text-xs text-fg-faint">Never assigns a judge who is on the team, declared a conflict, or judges other tracks. Submitted reviews are always kept. You can adjust single assignments in the table.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={draw}><Shuffle aria-hidden /> {preview ? 'Draw again' : hasAssignments ? 'Preview a new draw' : 'Preview assignment'}</Button>
        {preview && (
          <Button size="sm" disabled={pending} onClick={() => run(() => applyAssignment({ hackathonId, stageId, seed: preview.seed }), 'Judges assigned and notified', () => setPreview(null))}>
            Apply {preview.total} assignments
          </Button>
        )}
      </div>
      {preview && (
        <ul className="grid gap-1 rounded-lg border border-line p-3 text-sm sm:grid-cols-2">
          {preview.load.map((l) => <li key={l.judge} className="flex justify-between gap-3"><span className="truncate text-fg-muted">{l.judge}</span><span className="tabular-nums">{l.count}</span></li>)}
        </ul>
      )}
    </div>
  )
}

export type MatrixCell =
  | { kind: 'assigned'; assignmentId: string; state: 'pending' | 'draft' | 'done' | 'conflict' }
  | { kind: 'open' }
  | { kind: 'blocked'; reason: string }

/** Submissions × judges: who reviews what, why not, and (random stages) manual changes. */
export function AssignmentMatrix({ hackathonId, judges, rows, manual }: { hackathonId: string; judges: { id: string; label: string }[]; rows: { entryId: string; name: string; cells: MatrixCell[] }[]; manual: boolean }) {
  const { pending, run } = useActionToast()
  const tone = { pending: 'text-fg-muted', draft: 'text-info', done: 'text-success', conflict: 'text-warning' } as const
  const label = { pending: 'Assigned', draft: 'Draft', done: 'Reviewed', conflict: 'Conflict' } as const
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="sticky left-0 z-10 bg-surface-2 p-3 font-normal text-fg-muted">Submission</th>
            {judges.map((j) => <th key={j.id} className="max-w-36 truncate p-3 font-normal text-fg-muted" title={j.label}>{j.label}</th>)}
            <th className="p-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entryId} className="border-b border-line last:border-0">
              <td className="sticky left-0 z-10 max-w-56 truncate bg-surface-2 p-3 text-fg-heading">{r.name}</td>
              {r.cells.map((c, i) => (
                <td key={judges[i]!.id} className="p-2 align-middle">
                  {c.kind === 'assigned' ? (
                    <span className="inline-flex items-center gap-1">
                      <span className={`text-xs ${tone[c.state]}`}>{label[c.state]}</span>
                      {manual && (c.state === 'pending' || c.state === 'draft') && (
                        <button type="button" disabled={pending} aria-label={`Unassign ${judges[i]!.label} from ${r.name}`} onClick={() => run(() => unassignJudge({ hackathonId, assignmentId: c.assignmentId }), 'Unassigned')} className="grid size-7 place-items-center rounded text-fg-faint hover:bg-surface-hover hover:text-destructive"><X className="size-3.5" aria-hidden /></button>
                      )}
                    </span>
                  ) : c.kind === 'open' ? (
                    !manual ? <span className="text-xs text-fg-faint">When submissions close</span> :
                    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => assignJudge({ hackathonId, entryId: r.entryId, judgeId: judges[i]!.id }), 'Assigned')}><Plus aria-hidden /> Assign</Button>
                  ) : (
                    <span className="text-xs text-fg-faint" title={c.reason}>{c.reason}</span>
                  )}
                </td>
              ))}
              <td className="p-2 text-right">
                {manual && r.cells.some((c) => c.kind === 'open') && (
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => assignAllToEntry({ hackathonId, entryId: r.entryId }), 'All eligible judges assigned')}>Assign everyone</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CloseJudgingButton({ hackathonId, stageId, closed, canClose }: { hackathonId: string; stageId: string; closed: boolean; canClose: boolean }) {
  const { pending, run } = useActionToast()
  if (closed) return <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setJudgingClosed({ hackathonId, stageId, closed: false }), 'Judging reopened')}>Reopen judging</Button>
  return (
    <Button size="sm" disabled={pending || !canClose} title={canClose ? undefined : 'Available after submissions close'} onClick={() => confirm('Close judging? Reviews freeze and scores become visible to organisers.') && run(() => setJudgingClosed({ hackathonId, stageId, closed: true }), 'Judging closed')}>
      Close judging
    </Button>
  )
}

type Row = { entryId: string; rank: number | null; name: string; mean: number | null; min: number | null; max: number | null; reviews: number; advanced: boolean }

export function RankingTable({ hackathonId, stageId, rows, canAdvance }: { hackathonId: string; stageId: string; rows: Row[]; canAdvance: boolean }) {
  const [selected, setSelected] = useState<string[]>(rows.filter((r) => r.advanced).map((r) => r.entryId))
  const [topN, setTopN] = useState('')
  const { pending, run } = useActionToast()
  const advancedNow = rows.filter((r) => r.advanced).map((r) => r.entryId)
  const toAdd = selected.filter((id) => !advancedNow.includes(id))
  const toRemove = advancedNow.filter((id) => !selected.includes(id))
  return (
    <div className="space-y-4">
      {canAdvance && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor={`top-${stageId}`} className="text-xs text-fg-muted">Select top</label>
            <Input id={`top-${stageId}`} type="number" min={1} value={topN} onChange={(e) => setTopN(e.target.value)} className="h-10 w-24" />
          </div>
          <Button size="sm" variant="outline" onClick={() => setSelected(rows.filter((r) => r.rank != null).slice(0, Number(topN) || 0).map((r) => r.entryId))}>Select</Button>
          <Button
            size="sm"
            disabled={pending || (!toAdd.length && !toRemove.length)}
            onClick={async () => {
              if (toRemove.length && !(await run(() => setAdvanced({ hackathonId, stageId, entryIds: toRemove, advanced: false }), `${toRemove.length} removed from the next stage`))) return
              if (toAdd.length) await run(() => setAdvanced({ hackathonId, stageId, entryIds: toAdd, advanced: true }), `${toAdd.length} advanced — teams notified`)
            }}
          >
            Save advancement{toAdd.length ? ` (+${toAdd.length})` : ''}{toRemove.length ? ` (−${toRemove.length})` : ''}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="text-left text-fg-muted">
            <tr className="border-b border-line">
              {canAdvance && <th className="w-10 p-3"><span className="sr-only">Advance</span></th>}
              <th className="p-3">#</th><th className="p-3">Project</th><th className="p-3 text-right">Score</th><th className="p-3 text-right">Range</th><th className="p-3 text-right">Reviews</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entryId} className="border-b border-line last:border-0">
                {canAdvance && <td className="p-3"><Checkbox aria-label={`Advance ${r.name}`} checked={selected.includes(r.entryId)} onCheckedChange={(c) => setSelected(c ? [...selected, r.entryId] : selected.filter((x) => x !== r.entryId))} /></td>}
                <td className="p-3 tabular-nums text-fg-muted">{r.rank ?? '—'}</td>
                <td className="p-3 text-fg-heading">{r.name}{r.advanced && <span className="ml-2 text-xs text-success">advanced</span>}</td>
                <td className="p-3 text-right tabular-nums text-fg-heading">{r.mean ?? '—'}</td>
                <td className="p-3 text-right tabular-nums text-fg-muted">{r.min != null ? `${r.min}–${r.max}` : '—'}</td>
                <td className="p-3 text-right tabular-nums">{r.reviews}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

