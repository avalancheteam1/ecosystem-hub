import Link from 'next/link'
import { Pager } from '@/components/layout/pager'
import { pageParam, textParam } from '@/lib/params'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable } from '@/components/data-table'
import { requirePermission } from '@/lib/guards'
import { GRANT_PAGE_SIZE, operations } from '@/app/(site)/grants/_lib/queries'
import { addDays } from '@/app/(site)/grants/_lib/rules'
import { OperationsNav } from '@/app/(site)/grants/_components/navigation'

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ day?: string | string[]; page?: string | string[] }> }) {
  await requirePermission('grants.review')
  const query = await searchParams
  const requestedDay = textParam(query.day)
  const days = ['30', '90', '180']
  const day = requestedDay && days.includes(requestedDay) ? requestedDay : undefined
  const page = pageParam(query.page)
  const rows = await operations('impact', page)
  return (
    <>
      <PageHeader
        title="Impact updates"
        description="Track what changed after accepted delivery: 30, 90 and 180 days. Counts are cumulative, never summed across checkpoints."
      />
      <OperationsNav active="Impact updates" />
      <nav aria-label="Impact checkpoint filter" className="mb-6 flex flex-wrap gap-4">
        {['All', ...days].map((d) => (
          <Link
            className="inline-flex min-h-11 items-center underline underline-offset-4"
            key={d}
            href={d === 'All' ? '/admin/grants/impact' : `/admin/grants/impact?day=${d}`}
          >
            {d === 'All' ? d : `${d} days`}
          </Link>
        ))}
      </nav>
      <DataTable
        id="grants:impact-portfolio"
        columns={[
          { key: 'project', label: 'Project', hideable: false },
          { key: 'checkpoint', label: 'Checkpoint' },
          { key: 'due', label: 'Due (UTC day)', sortable: true },
          { key: 'state', label: 'State' },
        ]}
        rows={rows.slice(0, GRANT_PAGE_SIZE).flatMap((r) =>
          (day ? [day] : days)
            .map((d) => {
              const accepted = r.state.deliveries.findLast((delivery) => delivery.state === 'accepted')
              const report = r.state.impact.findLast((i) => i.day === d)
              return {
                id: `${r.id}:${d}`,
                cells: {
                  project: (
                    <Link
                      href={`/admin/grants/applications/${r.id}?tab=Impact&day=${d}`}
                      className="inline-flex min-h-11 items-center hover:underline"
                    >
                      {r.name}
                    </Link>
                  ),
                  checkpoint: `${d} days`,
                  due: accepted?.review?.at ? addDays(accepted.review.at.slice(0, 10), Number(d)) : 'Acceptance date unavailable',
                  state: report?.state ?? 'Awaiting update',
                },
              }
            }),
        )}
        empty="No monitoring plans match this checkpoint."
      />
      <Pager page={page} hasMore={rows.length > GRANT_PAGE_SIZE} params={{ day }} />
    </>
  )
}
