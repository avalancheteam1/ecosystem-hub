import { notFound } from 'next/navigation'
import { Download, Trophy } from 'lucide-react'
import { getManagedHackathon, getStageJudging } from '@/app/(site)/events/_lib/hackathons/queries'
import { rankEntries } from '@/app/(site)/events/_lib/hackathons/judging'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { AwardSelect, PublishResultsButton } from '../_components/results-controls'

export const metadata = { title: 'Results' }

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const last = h.stages.at(-1)
  const entries = last ? (await getStageJudging(last.id)).filter((e) => e.submission.status === 'active') : []
  const ranked = last?.judgingClosedAt
    ? rankEntries(entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, totals: e.assignments.flatMap((a) => (a.review?.submittedAt && !a.review.conflictDeclared && a.review.total != null ? [a.review.total] : [])) })))
    : entries.map((e) => ({ entryId: e.id, rank: null, mean: null }))
  const byId = new Map(entries.map((e) => [e.id, e]))
  const options = (trackId: string | null) =>
    ranked
      .map((r) => byId.get(r.entryId)!)
      .filter((e) => !trackId || e.submission.trackIds.includes(trackId))
      .map((e) => {
        const r = ranked.find((x) => x.entryId === e.id)!
        return { id: e.submission.id, label: `${r.rank ? `#${r.rank} ` : ''}${e.projectVersion.name}${r.mean != null ? ` (${r.mean})` : ''}` }
      })
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-fg-muted">
          {last?.judgingClosedAt ? `Teams from ${last.name}, best first.` : `Close judging of ${last?.name ?? 'the last stage'} to see the ranking here.`} Results appear on the public page once published.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline"><a href={`/manage/hackathons/${h.id}/export.csv`}><Download aria-hidden /> Export CSV</a></Button>
          <PublishResultsButton hackathonId={h.id} published={!!h.resultsPublishedAt} />
        </div>
      </div>
      {h.prizes.length === 0 ? (
        <p className="text-fg-muted">Add prizes under Tracks &amp; prizes first.</p>
      ) : (
        <SectionCard title="Prizes">
          <ul className="divide-y divide-line">
            {h.prizes.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Trophy className="size-4 shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-fg-heading">{p.title}{p.amount && <span className="text-fg-muted"> - {p.amount}</span>}</p>
                    <p className="text-xs text-fg-muted">{p.trackId ? h.tracks.find((t) => t.id === p.trackId)?.name : 'Overall'}</p>
                  </div>
                </div>
                <AwardSelect hackathonId={h.id} prizeId={p.id} value={p.award?.submissionId ?? null} options={options(p.trackId)} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
