import Link from 'next/link'
import { DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { StatusPill } from '@/components/status-pill'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { applicationStatusCopy } from '../_lib/rules'
import { RoundIntakeStatus } from './navigation'
import type { listApplications } from '../_lib/queries'
export function ApplicationList({ rows, staff }: { rows: Awaited<ReturnType<typeof listApplications>>; staff: boolean }) {
  const base = staff ? '/admin/grants/applications' : '/grants/applications'
  const applications = rows.map((r) => ({
    id: r.id,
    cells: {
      project: r.projectVersion.name,
      stage: PROJECT_MATURITY[r.projectVersion.maturity as ProjectMaturity]?.label ?? 'Stage not set',
      round: (
        <div className="flex flex-col items-start gap-1">
          <span className="wrap-anywhere">{r.round.name}</span>
          <RoundIntakeStatus open={r.round.published} />
        </div>
      ),
      status: (
        <div className="flex flex-wrap gap-2">
          <StatusPill className="text-fg-heading" tone={r.status === 'approved' ? 'success' : r.status === 'draft' ? 'neutral' : 'info'}>
            {applicationStatusCopy[r.applicantStatus.status].label}
          </StatusPill>
          {r.applicantStatus.updateRequested && <StatusPill className="text-fg-heading" tone="warning">Update requested</StatusPill>}
        </div>
      ),
      updated: r.updatedAt.toISOString().slice(0, 10),
      action: (
        <Link className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4" href={`${base}/${r.id}`}>
          {staff ? 'Review application' : r.status === 'draft' ? 'Continue draft' : 'Open application'}
        </Link>
      ),
    },
  }))
  return !rows.length ? (
    <EmptyState
      title={staff ? 'No submitted applications' : 'No applications yet'}
      action={
        <Link
          href={staff ? '/admin/grants/rounds' : '/grants/mini-grants/apply'}
          className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4"
        >
          {staff ? 'Manage rounds' : 'Start an application'}
        </Link>
      }
    >
      {staff ? 'Submitted applications will appear here.' : 'Start with an existing Hub project and one useful milestone.'}
    </EmptyState>
  ) : (
    <>
      {!staff && (
        <ul aria-label="Grant applications" className="grid gap-3 md:hidden">
          {applications.map(({ id, cells }) => (
            <li key={id} className="min-w-0 space-y-3 rounded-xl border border-line p-4 text-sm">
              <div>
                <h3 className="wrap-anywhere text-base">{cells.project}</h3>
                <p className="mt-1 text-xs text-fg-muted">Project stage <span>{cells.stage}</span></p>
              </div>
              {cells.status}
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                {cells.action}
                <p className="text-xs text-fg-muted">Updated <time dateTime={cells.updated}>{cells.updated}</time></p>
              </div>
              <div className="border-t border-line pt-3 text-xs text-fg-muted">{cells.round}</div>
            </li>
          ))}
        </ul>
      )}
      <div className={staff ? undefined : 'hidden md:block'}>
        <DataTable
          id={`grants:${staff ? 'review' : 'applicant'}`}
          columns={[
            {
              key: 'project',
              label: 'Project',
              hideable: false,
              sortable: true,
            },
            {
              key: 'stage',
              label: 'Project stage',
            },
            {
              key: 'round',
              label: 'Round',
            },
            {
              key: 'status',
              label: 'Status',
            },
            {
              key: 'updated',
              label: 'Updated (UTC)',
              sortable: true,
            },
            {
              key: 'action',
              label: 'Next step',
            },
          ]}
          rows={applications.map(({ id, cells }) => ({
            id,
            cells: {
              ...cells,
              stage: <p className="text-xs text-fg-muted">{cells.stage}</p>,
            },
          }))}
        />
      </div>
      <p className="mt-3 text-xs text-fg-muted">Showing up to 100 most recently updated applications. Use search to narrow the list.</p>
    </>
  )
}
