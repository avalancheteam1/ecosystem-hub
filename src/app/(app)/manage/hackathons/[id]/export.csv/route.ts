import { getManagedHackathon, getStageJudging, listSubmissions } from '@/app/(site)/events/_lib/hackathons/queries'
import { rankEntries } from '@/app/(site)/events/_lib/hackathons/judging'
import { getCurrentUser } from '@/lib/session'

// CSV of every submission with per-stage version, score, rank and advancement.
// Guarded like the console (organisers + hackathons.manage). Scores of a stage
// are only included once its judging is closed (same as the UI).

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // quote, and neutralise spreadsheet formula injection
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const h = await getManagedHackathon((await params).id, user)
  if (!h) return new Response('Not found', { status: 404 })
  const subs = await listSubmissions(h.id)
  const perStage = await Promise.all(
    h.stages.map(async (s) => {
      const entries = await getStageJudging(s.id)
      const ranked = s.judgingClosedAt
        ? rankEntries(entries.filter((e) => e.submission.status === 'active').map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, totals: e.assignments.flatMap((a) => (a.review?.submittedAt && !a.review.conflictDeclared && a.review.total != null ? [a.review.total] : [])) })))
        : []
      return { s, entries, ranked }
    }),
  )
  const header = ['Project', 'Status', 'Tracks', 'Team', 'Emails', ...h.stages.flatMap((s) => [`${s.name} version`, `${s.name} score`, `${s.name} rank`, `${s.name} advanced`]), 'Awards']
  const rows = subs.map((sub) => {
    const stageCols = perStage.flatMap(({ entries, ranked }) => {
      const e = entries.find((x) => x.submission.id === sub.id)
      const r = e && ranked.find((x) => x.entryId === e.id)
      return [e?.projectVersion.number ?? '', r?.mean ?? '', r?.rank ?? '', e ? (e.advancedAt ? 'yes' : 'no') : '']
    })
    const awards = h.prizes.filter((p) => p.award?.submissionId === sub.id).map((p) => p.title).join('; ')
    return [
      sub.project.currentVersion?.name,
      sub.status,
      sub.trackIds.map((t) => h.tracks.find((x) => x.id === t)?.name).join('; '),
      sub.project.members.map((m) => m.user.name).join('; '),
      sub.project.members.map((m) => m.user.email).join('; '),
      ...stageCols,
      awards,
    ]
  })
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
  const name = h.event.slug.replace(/[^a-z0-9-]/g, '')
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-submissions.csv"`, 'Cache-Control': 'no-store' },
  })
}
