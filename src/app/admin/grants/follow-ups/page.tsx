import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/data-table'
import { requirePermission } from '@/lib/guards'
import { operations } from '@/app/(site)/grants/_lib/queries'
import { OperationsNav } from '@/app/(site)/grants/_components/navigation'

export default async function FollowupsPage() {
  await requirePermission('grants.review')
  const rows = await operations('followups'),
    today = new Date().toISOString().slice(0, 10)
  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Every case has a next useful action. Open a case to add, reschedule or complete an action."
      />
      <OperationsNav active="Follow-ups" />
      <DataTable
        id="grants:followups"
        columns={[
          { key: 'project', label: 'Project', hideable: false },
          { key: 'action', label: 'Next action' },
          { key: 'due', label: 'Due (UTC day)', sortable: true },
          { key: 'waiting', label: 'Waiting on' },
          { key: 'state', label: 'State' },
        ]}
        rows={rows.flatMap((r) =>
          r.state.followups.map((f) => ({
            id: `${r.id}:${f.id}`,
            sort: { due: f.due },
            cells: {
              project: (
                <Link
                  href={`/admin/grants/applications/${r.id}?tab=Follow-ups`}
                  className="inline-flex min-h-11 items-center hover:underline"
                >
                  {r.name}
                </Link>
              ),
              action: f.title,
              due: f.due,
              waiting: f.waitingOn,
              state: f.state === 'open' && f.due < today ? 'Overdue' : f.state,
            },
          })),
        )}
        empty="No follow-ups recorded. Open a case to add its next useful action."
      />
      <p className="mt-3 text-xs text-fg-muted">
        Actions from up to 100 most recently updated submitted grants. Draft reminders remain unsent.
      </p>
    </>
  )
}
