import type { SubmittedMember } from '@/lib/submission-team'
import { csv, submissionExportRows } from '@/app/(site)/events/_lib/hackathons/csv'
import { getManagedHackathon, getStageJudging, listSubmissions, listSubmissionTeamUsers } from '@/app/(site)/events/_lib/hackathons/queries'
import { rankEntries } from '@/app/(site)/events/_lib/hackathons/judging'
import { placeTitle } from '@/app/(site)/events/_lib/hackathons/rules'
import { getCurrentUser } from '@/lib/session'

// CSV of every submission with per-stage version, score, rank and advancement.
// Guarded like the console (organisers + hackathons.manage). Scores of a stage
// are only included once its judging is closed (same as the UI).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const h = await getManagedHackathon((await params).id, user)
  if (!h) return new Response('Not found', { status: 404 })
  const subs = await listSubmissions(h.id)
  const teamIds = [...new Set(subs.flatMap((sub) => (sub.entries.at(-1)?.teamSnapshot as SubmittedMember[] | undefined)?.map((m) => m.userId) ?? []))]
  const teamEmails = new Map((await listSubmissionTeamUsers(teamIds)).map((u) => [u.id, u.email]))
  const perStage = await Promise.all(
    h.stages.map(async (s) => {
      const entries = await getStageJudging(s.id)
      const ranked = s.judgingClosedAt
        ? rankEntries(entries.filter((e) => e.submission.status === 'active').map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, totals: e.assignments.flatMap((a) => (a.review?.submittedAt && !a.review.conflictDeclared && a.review.total != null ? [a.review.total] : [])) })))
        : []
      return { s, entries, ranked }
    }),
  )
  const rows = subs.map((sub) => {
    const stageCols = perStage.map(({ entries, ranked }) => {
      const e = entries.find((x) => x.submission.id === sub.id)
      const r = e && ranked.find((x) => x.entryId === e.id)
      return [e?.projectVersion.number ?? '', r?.mean ?? '', r?.rank ?? '', e ? (e.advancedAt ? 'yes' : 'no') : '']
    })
    const awards = h.prizes.flatMap((p) => p.awards.filter((a) => a.submissionId === sub.id).map((a) => (p.placementTo ? `${p.title} (${placeTitle(a.placement)})` : p.title))).join('; ')
    return {
      name: sub.entries.at(-1)?.projectVersion.name ?? sub.project.currentVersion?.name,
      status: sub.status, trackIds: sub.trackIds, sponsorPrizeIds: sub.sponsorPrizeIds,
      team: ((sub.entries.at(-1)?.teamSnapshot as SubmittedMember[] | undefined) ?? []).map((m) => ({ name: m.name, email: teamEmails.get(m.userId) ?? '' })), stages: stageCols, awards,
    }
  })
  const content = csv(submissionExportRows(h, rows))
  const name = h.event.slug.replace(/[^a-z0-9-]/g, '')
  return new Response(content, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-submissions.csv"`, 'Cache-Control': 'no-store' },
  })
}
