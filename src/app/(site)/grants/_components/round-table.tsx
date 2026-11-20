'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DataTable } from '@/components/data-table'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/empty-state'
import { criterionIds, type Assessment } from '../_lib/schemas'
import { score } from '../_lib/rules'
type Row = {
  id: string
  name: string
  assessment: Assessment
  holds: string[]
  score?: ReturnType<typeof score>
}
export function RoundTable({ rows }: { rows: Row[] }) {
  const [picked, setPicked] = useState<string[]>([])
  const selected = rows.filter((r) => picked.includes(r.id))
  const scored = rows.map((r) => ({
    ...r,
    score: r.score ?? score(r.assessment),
  }))
  const ranks = new Map(
    scored.map((r) => [
      r.id,
      r.score.total === null ? null : 1 + scored.filter((other) => other.score.total !== null && other.score.total > r.score.total!).length,
    ]),
  )
  return (
    <div className="space-y-8">
      <p className="text-sm text-fg-muted">
        Select two to four projects. Equal scores share rank; ND has no rank. Bounds and readiness remain visible. Ranking is informational.
      </p>
      <DataTable
        id="grants:round-comparison"
        columns={[
          {
            key: 'select',
            label: 'Compare',
            hideable: false,
          },
          {
            key: 'project',
            label: 'Project',
            sortable: true,
          },
          {
            key: 'rank',
            label: 'Rank',
            sortable: true,
          },
          {
            key: 'score',
            label: 'Provisional',
          },
          {
            key: 'bounds',
            label: 'Evidence bounds',
          },
          {
            key: 'holds',
            label: 'Readiness',
          },
        ]}
        rows={scored.map((r) => ({
          id: r.id,
          sort: {
            project: r.name,
            rank: ranks.get(r.id),
          },
          cells: {
            select: (
              <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                <Checkbox
                  aria-label={`Compare ${r.name}`}
                  checked={picked.includes(r.id)}
                  disabled={!picked.includes(r.id) && picked.length >= 4}
                  onCheckedChange={(checked) => setPicked((old) => (checked ? [...old, r.id] : old.filter((id) => id !== r.id)))}
                />
              </label>
            ),
            project: (
              <Link className="inline-flex min-h-11 items-center hover:underline" href={`/admin/grants/applications/${r.id}`}>
                {r.name}
              </Link>
            ),
            rank: ranks.get(r.id) ?? 'ND',
            score: r.score.total?.toFixed(1) ?? 'ND',
            bounds: `${r.score.lower.toFixed(1)}-${r.score.upper.toFixed(1)} / ${r.score.coverage}% E`,
            holds: r.holds.length ? `${r.holds.length} hold(s)` : 'Ready for authority review',
          },
        }))}
      />
      {selected.length < 2 ? (
        <EmptyState title="Select two to four projects">
          Compare criterion values and their sources without changing the recorded assessment.
        </EmptyState>
      ) : (
        <DataTable
          id="grants:criteria-comparison"
          columns={[
            {
              key: 'criterion',
              label: 'Criterion',
              hideable: false,
            },
            ...selected.map((r) => ({
              key: r.id,
              label: r.name,
            })),
          ]}
          rows={criterionIds.map((id) => ({
            id,
            cells: {
              criterion: id,
              ...Object.fromEntries(
                selected.map((r) => {
                  const c = r.assessment.criteria[id]
                  return [
                    r.id,
                    <div key={r.id} className="min-w-48 space-y-2">
                      <strong>
                        {c.score}
                        {c.score === 'ND' ? '' : c.basis}
                      </strong>
                      <p className="text-xs text-fg-muted">{c.source || 'No source recorded'}</p>
                      <p className="text-sm whitespace-pre-wrap">{c.rationale || 'No rationale recorded'}</p>
                    </div>,
                  ]
                }),
              ),
            },
          }))}
        />
      )}
    </div>
  )
}
