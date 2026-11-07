import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getManagedHackathon, listSubmissions } from '@/app/(site)/events/_lib/hackathons/queries'
import { DataTable, type DataTableRow } from '@/components/data-table'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { StatusPill } from '@/components/status-pill'
import { requireUser } from '@/lib/guards'
import { pageParam, sortParams, textParam } from '@/lib/params'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { compareSortValues } from '@/lib/table-sort'
import { SubmissionStatusButton } from '../_components/submission-controls'

export const metadata = { title: 'Submissions' }

const PAGE_SIZE = 20

export default async function SubmissionsPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ q?: string | string[]; page?: string | string[]; sort?: string | string[]; dir?: string | string[] }>
}) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const sp = await searchParams
  const q = textParam(sp.q)
  const page = pageParam(sp.page)
  const subs = await listSubmissions(h.id, q)
  const trackName = (id: string) => h.tracks.find((t) => t.id === id)?.name
  const columns = [
    { key: 'project', label: 'Project', sortable: true, hideable: false },
    { key: 'team', label: 'Team', sortable: true },
    { key: 'maturity', label: 'Project stage', sortable: true },
    ...h.stages.map((st) => ({ key: `stage-${st.id}`, label: st.name, sortable: true, className: 'whitespace-nowrap' })),
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: '', hideable: false, className: 'text-right' },
  ]
  // 'createdAt' = no column highlighted, submission order (as loaded).
  const sort = sortParams(sp, ['createdAt', ...columns.filter((c) => c.sortable).map((c) => c.key)], { key: 'createdAt', dir: 'asc' })
  const rows: DataTableRow[] = subs.map((s) => {
    const team = s.project.members.map((m) => m.user.name).join(', ')
    // Stage of the version the team submitted last (what judges see), not the live draft.
    const maturity = PROJECT_MATURITY[s.entries.at(-1)?.projectVersion.maturity as ProjectMaturity]?.label
    const entries = h.stages.map((st) => [st.id, s.entries.find((x) => x.stageId === st.id)] as const)
    return {
      id: s.id,
      // Stage sort: advanced first, then submitted, then missing.
      sort: { project: s.project.currentVersion?.name, team, maturity, status: s.status, ...Object.fromEntries(entries.map(([id, e]) => [`stage-${id}`, e ? (e.advancedAt ? 2 : 1) : null])) },
      cells: {
        project: (
          <>
            <Link href={`/manage/hackathons/${h.id}/submissions/${s.id}`} className="text-fg-heading hover:underline">{s.project.currentVersion?.name}</Link>
            <div className="text-xs text-fg-muted">{s.trackIds.map(trackName).filter(Boolean).join(', ')}</div>
          </>
        ),
        team,
        maturity: maturity ?? <span className="text-fg-faint">-</span>,
        ...Object.fromEntries(entries.map(([id, e]) => [`stage-${id}`, e ? <>v{e.projectVersion.number}{e.advancedAt && <StatusPill tone="success" className="ml-2">Advanced</StatusPill>}</> : <span className="text-fg-faint">-</span>])),
        status: <StatusPill tone={s.status === 'active' ? 'success' : s.status === 'disqualified' ? 'danger' : 'neutral'}>{s.status}</StatusPill>,
        actions: <SubmissionStatusButton hackathonId={h.id} submissionId={s.id} status={s.status} />,
      },
    }
  })
  // ponytail: sorts + pages in memory so team/stage sorts work across pages; move to SQL if a hackathon gets thousands of submissions.
  if (sort.key !== 'createdAt') rows.sort((a, b) => compareSortValues(a.sort?.[sort.key], b.sort?.[sort.key], sort.dir))
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return (
    <section className="min-w-0">
      <SearchForm q={q} placeholder="Search project or team member" />
      <DataTable id="manage-submissions" sort={sort} empty={q ? 'No submissions found.' : 'No submissions yet.'} columns={columns} rows={shown} />
      <Pager page={page} hasMore={rows.length > page * PAGE_SIZE} params={{ q, sort: sort.key, dir: sort.dir }} />
    </section>
  )
}
