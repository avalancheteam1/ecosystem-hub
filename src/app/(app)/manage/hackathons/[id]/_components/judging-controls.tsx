'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Shuffle, X } from 'lucide-react'
import { applyAssignment, assignAllToEntry, assignJudge, previewAssignment, setAdvanced, setJudgingClosed, unassignJudge } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
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
      <p className="text-sm">Random, balanced - {perEntry ?? '?'} judge{perEntry === 1 ? '' : 's'} per submission <span className="text-fg-faint">(change under Stages)</span></p>
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

type Row = { entryId: string; rank: number | null; name: string; href: string; criterionMeans: Record<string, number | null>; mean: number | null; min: number | null; max: number | null; reviews: number; advanced: boolean }

export function RankingTable({ hackathonId, stageId, rows, canAdvance, criteria, scaleMax }: { hackathonId: string; stageId: string; rows: Row[]; canAdvance: boolean; criteria: { id: string; name: string }[]; scaleMax: number }) {
  const { pending, run } = useActionToast()
  const advancedIds = rows.filter((r) => r.advanced).map((r) => r.entryId)
  return (
    <DataTable
      id="manage-judging-ranking"
      empty="No submissions in this stage."
      selection={canAdvance ? {
        actions: (ids, clear) => {
          const add = ids.filter((x) => !advancedIds.includes(x))
          const remove = ids.filter((x) => advancedIds.includes(x))
          return (
            <>
              <Button size="sm" disabled={pending || !add.length} onClick={() => run(() => setAdvanced({ hackathonId, stageId, entryIds: add, advanced: true }), `${add.length} advanced - teams notified`, clear)}>
                Advance to next stage{add.length ? ` (${add.length})` : ''}
              </Button>
              <Button size="sm" variant="outline" disabled={pending || !remove.length} onClick={() => run(() => setAdvanced({ hackathonId, stageId, entryIds: remove, advanced: false }), `${remove.length} removed from the next stage`, clear)}>
                Remove from next stage{remove.length ? ` (${remove.length})` : ''}
              </Button>
            </>
          )
        },
      } : undefined}
      columns={[
        { key: 'rank', label: '#', sortable: true, hideable: false },
        { key: 'name', label: 'Project', sortable: true, hideable: false },
        { key: 'mean', label: 'Score', sortable: true, firstDir: 'desc' as const, className: 'text-right' },
        ...criteria.map((c) => ({ key: `c-${c.id}`, label: `${c.name} (/${scaleMax})`, sortable: true, firstDir: 'desc' as const, className: 'text-right' })),
        { key: 'range', label: 'Range', className: 'text-right' },
        { key: 'reviews', label: 'Reviews', sortable: true, firstDir: 'desc' as const, className: 'text-right' },
      ]}
      rows={rows.map((r) => ({
        id: r.entryId,
        sort: { rank: r.rank, name: r.name, mean: r.mean, reviews: r.reviews, ...Object.fromEntries(criteria.map((c) => [`c-${c.id}`, r.criterionMeans[c.id]])) },
        cells: {
          rank: <span className="tabular-nums text-fg-muted">{r.rank ?? '-'}</span>,
          name: <><Link href={r.href} className="text-fg-heading hover:underline">{r.name}</Link>{r.advanced && <span className="ml-2 text-xs text-success">advanced</span>}</>,
          mean: <span className="tabular-nums text-fg-heading">{r.mean ?? '-'}</span>,
          ...Object.fromEntries(criteria.map((c) => [`c-${c.id}`, <span key={c.id} className="tabular-nums">{r.criterionMeans[c.id] ?? '-'}</span>])),
          range: <span className="tabular-nums text-fg-muted">{r.min != null ? `${r.min}–${r.max}` : '-'}</span>,
          reviews: <span className="tabular-nums">{r.reviews}</span>,
        },
      }))}
    />
  )
}

