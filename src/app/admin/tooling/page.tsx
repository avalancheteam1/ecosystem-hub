import type { Metadata } from 'next'
import Link from 'next/link'
import { listListingsForReview } from '@/app/(site)/tooling/_lib/queries'
import { approveProblem } from '@/app/(site)/tooling/_lib/rules'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { requirePermission } from '@/lib/guards'

export const metadata: Metadata = { title: 'Tooling' }

type Row = Awaited<ReturnType<typeof listListingsForReview>>[number]

/** A newer version the reviewer can approve right now (one that fails the checks waits for the team, not the reviewer). */
const approvableNewer = (r: Row) => !!r.newer && !approveProblem(r, r.newer, !!r.project.archivedAt)
/** Sort key: waiting for review first, then listed, then the rest. */
const rank = (r: Row) => (r.closedAt || r.project.archivedAt ? 3 : r.pendingVersion || approvableNewer(r) ? 0 : r.approvedVersion ? 1 : 2)

function Status({ r }: { r: Row }) {
  if (r.project.archivedAt) return <StatusPill tone="danger">Project deleted</StatusPill>
  if (r.closedAt) return <StatusPill>{r.closedReason === 'removed' ? 'Removed' : 'Withdrawn'}</StatusPill>
  return (
    <span className="flex flex-wrap gap-1.5">
      {r.pendingVersion && <StatusPill tone="info">To review · v{r.pendingVersion.number}</StatusPill>}
      {r.newer && (approvableNewer(r)
        ? <StatusPill tone="warning">Newer · v{r.newer.number}</StatusPill>
        : <StatusPill tone={r.newer.maturity === 'archived' ? 'danger' : 'neutral'}>Newer · v{r.newer.number} · {r.newer.maturity === 'archived' ? 'archived' : 'can’t approve'}</StatusPill>)}
      {r.approvedVersion && <StatusPill tone="success">Listed · v{r.approvedVersion.number}</StatusPill>}
      {!r.pendingVersion && !r.approvedVersion && r.rejectedAt && <StatusPill tone="warning">Rejected</StatusPill>}
    </span>
  )
}

export default async function ToolingAdminPage() {
  await requirePermission('tooling.review')
  const rows = (await listListingsForReview()).toSorted((a, b) => rank(a) - rank(b))
  return (
    <>
      <PageHeader title="Tooling" description="Projects submitted to the Developer Tooling list. Only approved versions are shown on /tooling." />
      <DataTable
        id="admin-tooling"
        empty="No submissions yet."
        columns={[
          { key: 'name', label: 'Project', hideable: false },
          { key: 'status', label: 'Status' },
          { key: 'updated', label: 'Updated', className: 'whitespace-nowrap' },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: {
            name: <Link href={`/admin/tooling/${r.id}`} className="text-fg-heading hover:underline">{r.project.currentVersion?.name ?? r.project.slug}</Link>,
            status: <Status r={r} />,
            updated: r.updatedAt.toISOString().slice(0, 10),
          },
        }))}
      />
    </>
  )
}
