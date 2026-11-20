import { publicationText } from '@/app/(site)/events/_lib/hackathons/presentation'
import { SubmissionFilters } from '@/app/(site)/events/_components/hackathon/submission-filters'
import { matchesSubmissionFilters, needsResultsReminder } from '@/app/(site)/events/_lib/hackathons/feedback-rules'
import { notFound } from 'next/navigation'
import { Download, Trophy } from 'lucide-react'
import { getManagedHackathon, countPublishedWinners, getStageJudging, listAwardableSubmissions } from '@/app/(site)/events/_lib/hackathons/queries'
import { rankEntries } from '@/app/(site)/events/_lib/hackathons/judging'
import { placeTitle, prizePlaces } from '@/app/(site)/events/_lib/hackathons/rules'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { AwardSelect, PublishResultsButton, PublishPrizeButton } from '../_components/results-controls'

export const metadata = { title: 'Results' }

export default async function ResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ track?: string; sponsor?: string }> }) {
  const filters = await searchParams
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const publishedWinners = await countPublishedWinners(h.id)
  const last = h.stages.at(-1)
  const [judged, awardable] = await Promise.all([last ? getStageJudging(last.id) : [], listAwardableSubmissions(h.id)])
  const entries = judged.filter((e) => e.submission.status === 'active' && matchesSubmissionFilters(e.submission, filters))
  const ranked = last?.judgingClosedAt
    ? rankEntries(entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, totals: e.assignments.flatMap((a) => (a.review?.submittedAt && !a.review.conflictDeclared && a.review.total != null ? [a.review.total] : [])) })))
    : entries.map((e) => ({ entryId: e.id, rank: null, mean: null }))
  const byId = new Map(entries.map((e) => [e.id, e]))
  const inLast = new Set(entries.map((e) => e.submission.id))
  // Overall prizes: teams of the last stage, ranked. Track prizes: those first, then the track's teams that left earlier.
  const options = (trackId: string | null, sponsorPrizeId: string | null, currentIds: string[]) => [
    ...ranked
      .map((r) => byId.get(r.entryId)!)
      .filter((e) => (!trackId || e.submission.trackIds.includes(trackId)) && (!sponsorPrizeId || e.submission.sponsorPrizeIds.includes(sponsorPrizeId)))
      .map((e) => {
        const r = ranked.find((x) => x.entryId === e.id)!
        return { id: e.submission.id, label: `${r.rank ? `#${r.rank} ` : ''}${e.projectVersion.name}${r.mean != null ? ` (${r.mean})` : ''}` }
      }),
    ...((trackId || sponsorPrizeId)
      ? awardable
          .filter((s) => !inLast.has(s.id) && (!trackId || s.trackIds.includes(trackId)) && (!sponsorPrizeId || s.sponsorPrizeIds.includes(sponsorPrizeId)) && matchesSubmissionFilters(s, filters) && s.entries[0])
          .map((s) => ({ id: s.id, label: `${s.entries[0]!.projectVersion.name} (left in ${s.entries[0]!.stage.name})` }))
      : []),
  ].concat(awardable.filter((s) => currentIds.includes(s.id) && !matchesSubmissionFilters(s, filters) && s.entries[0]).map((s) => ({ id: s.id, label: `${s.entries[0]!.projectVersion.name} (current winner, outside filters)` })))
  return (
    <div className="space-y-8">
      <SubmissionFilters tracks={h.tracks} sponsorPrizes={h.sponsorPrizes} value={filters} />
      {needsResultsReminder(h.stages, publishedWinners) && <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-4">Judging is closed, but results are empty. Set and publish the overall winner now; track and sponsor winners can follow independently.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-fg-muted">
          {last?.judgingClosedAt ? `Teams from ${last.name}, best first.` : `Close judging of ${last?.name ?? 'the last stage'} to see the ranking here.`} Results appear on the public page once published. Filters narrow candidate lists; current winners stay visible.
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
                    <p className="text-xs text-fg-muted">{p.sponsorPrizeId ? h.sponsorPrizes.find((sp) => sp.id === p.sponsorPrizeId)?.sponsor : p.trackId ? h.tracks.find((t) => t.id === p.trackId)?.name : 'Overall'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:w-96">
                  {prizePlaces(p).map((place) => (
                    <AwardSelect key={place} hackathonId={h.id} prizeId={p.id} placement={place} label={p.placementTo ? placeTitle(place) : undefined} value={p.awards.find((a) => a.placement === place)?.submissionId ?? null} options={options(p.trackId, p.sponsorPrizeId, p.awards.map((a) => a.submissionId))} />
                  ))}
                  <p className="text-xs text-fg-muted">{p.publishedAt ? publicationText(p.publishedAt, h.timezone) : `Winner to be announced. ${publicationText(null, h.timezone)}`}</p>
                  <PublishPrizeButton hackathonId={h.id} prizeId={p.id} published={!!p.publishedAt} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  )
}
