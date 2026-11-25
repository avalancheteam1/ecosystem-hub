import Link from 'next/link'
import { DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { FilterChip } from '@/components/filter-chip'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { StatusPill } from '@/components/status-pill'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { REVIEW_QUEUE_ACTIONS, type ReviewQueueLocation } from '../_lib/review-queue'
import type { ReviewQueuePage } from '../_lib/review-queue-queries'
import { applicationStatusCopy } from '../_lib/rules'
import { RoundIntakeStatus } from './navigation'

type Row = ReviewQueuePage['rows'][number]
const queuePath = '/admin/grants'
const linkClass = 'inline-flex min-h-11 items-center underline underline-offset-4'
const actionLabels = Object.fromEntries(REVIEW_QUEUE_ACTIONS)

function queueHref(params: { q?: string; action?: string; view?: string; page?: number }) {
  const search = new URLSearchParams()
  if (params.q) search.set('q', params.q)
  if (params.action) search.set('action', params.action)
  if (params.view === 'kanban') search.set('view', params.view)
  if (params.page && params.page > 1) search.set('page', String(params.page))
  return search.size ? `${queuePath}?${search}` : queuePath
}

function caseHref(id: string) {
  return `${queuePath}/applications/${id}`
}

function ProjectMetadata({ row }: { row: Row }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
      <span>{PROJECT_MATURITY[row.maturity as ProjectMaturity]?.label ?? 'Stage not set'}</span>
      {row.round && <span className="wrap-anywhere">{row.round.name}</span>}
      <span>Updated <time dateTime={row.updatedAt.toISOString()}>{row.updatedAt.toISOString().slice(0, 10)} UTC</time></span>
    </p>
  )
}

function ReleasedStatus({ status }: { status: Row['status'] }) {
  return <StatusPill tone={status === 'approved' ? 'success' : 'neutral'}>{applicationStatusCopy[status].label}</StatusPill>
}

function QueueCards({ rows, showAction }: { rows: Row[]; showAction?: boolean }) {
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <Link href={caseHref(row.id)} prefetch={false}
            className="block min-h-11 space-y-2 rounded-xl border border-line bg-surface-1 p-3 text-fg-heading hover:border-brand">
            <p className="wrap-anywhere font-medium">{row.name}</p>
            <ProjectMetadata row={row} />
            <div className="flex flex-wrap gap-2">
              <ReleasedStatus status={row.status} />
              {showAction && <StatusPill tone="info">{actionLabels[row.nextAction]}</StatusPill>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function QueueTable({ rows }: { rows: Row[] }) {
  return (
    <DataTable id="grants:review" columns={[
      { key: 'project', label: 'Project', hideable: false, sortable: true },
      { key: 'stage', label: 'Project stage' },
      { key: 'round', label: 'Round' },
      { key: 'status', label: 'Applicant status' },
      { key: 'updated', label: 'Updated (UTC)', sortable: true },
      { key: 'action', label: 'Next action' },
    ].filter(({ key }) => key !== 'round' || rows.some((row) => row.round))}
      rows={rows.map((row) => ({ id: row.id, sort: { project: row.name }, cells: {
        project: <Link href={caseHref(row.id)} prefetch={false} className={`${linkClass} wrap-anywhere`}>{row.name}</Link>,
        stage: PROJECT_MATURITY[row.maturity as ProjectMaturity]?.label ?? 'Stage not set',
        round: row.round && (
          <div className="flex flex-col items-start gap-1">
            <span className="wrap-anywhere">{row.round.name}</span>
            <RoundIntakeStatus open={row.round.open} />
          </div>
        ),
        status: <ReleasedStatus status={row.status} />,
        updated: row.updatedAt.toISOString().slice(0, 10),
        action: <StatusPill tone="info">{actionLabels[row.nextAction]}</StatusPill>,
      } }))} />
  )
}

export function ReviewQueue({ location, result: { rows, hasMore } }: { location: ReviewQueueLocation; result: ReviewQueuePage }) {
  const { q, action, view, page } = location
  const keep = { ...(view === 'kanban' ? { view } : {}), ...(action ? { action } : {}) }
  const actions = REVIEW_QUEUE_ACTIONS.filter(([key]) => !action || key === action)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchForm key={`${view}:${action ?? ''}`} q={q} keep={keep} placeholder="Search project" className="mb-0 flex-1 basis-56" />
        <nav aria-label="Queue view" className="hidden gap-2 md:flex">
          <FilterChip href={queueHref({ ...location, view: 'list' })} active={view === 'list'}>List</FilterChip>
          <FilterChip href={queueHref({ ...location, view: 'kanban' })} active={view === 'kanban'}>Kanban</FilterChip>
        </nav>
      </div>
      <nav aria-label="Filter by next action" className="mb-5 flex flex-wrap gap-2">
        <FilterChip href={queueHref({ q, view })} active={!action}>All actions</FilterChip>
        {REVIEW_QUEUE_ACTIONS.map(([key, label]) => (
          <FilterChip key={key} href={queueHref({ q, view, action: key })} active={action === key}>{label}</FilterChip>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'No applications on this page' : q || action ? 'No matching applications' : 'No submitted applications'}
          action={page > 1 ? <Link className={linkClass} href={queueHref({ q, action, view })}>Back to first page</Link>
            : q || action ? <Link className={linkClass} href={queueHref({ view })}>Clear search and filters</Link> : undefined}
        >
          {page > 1 ? 'Return to the first page for the latest results.'
            : q || action ? 'Try a different project name or next action.' : 'Submitted applications will appear here.'}
        </EmptyState>
      ) : (
        <>
          <section aria-label="Application list" className="md:hidden"><QueueCards rows={rows} showAction /></section>
          {view === 'list' ? (
            <section aria-label="Application list" className="hidden md:block"><QueueTable rows={rows} /></section>
          ) : (
            <section aria-label="Application Kanban" className="hidden md:block">
              <p id="queue-kanban-help" className="mb-3 text-sm text-fg-muted">Lane counts are for this page.</p>
              <div role="region" aria-label="Next-action lanes" aria-describedby="queue-kanban-help"
                tabIndex={action ? undefined : 0}
                className={action ? 'max-w-lg' : 'grid grid-flow-col auto-cols-[minmax(11rem,1fr)] gap-3 overflow-x-auto rounded-xl p-1 pb-3 xl:auto-cols-[minmax(9rem,1fr)]'}>
                {actions.map(([key, label]) => {
                  const cards = rows.filter((row) => row.nextAction === key)
                  return (
                    <section key={key} aria-labelledby={`queue-${key}`} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3">
                      <h2 id={`queue-${key}`} className="mb-3 flex items-baseline justify-between gap-2 font-medium">
                        {label} <span className="text-sm text-fg-muted">{cards.length}</span>
                      </h2>
                      {cards.length ? <QueueCards rows={cards} /> : <p className="text-sm text-fg-muted">No applications on this page.</p>}
                    </section>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
      <Pager page={page} hasMore={hasMore} params={{ q, ...keep }} />
    </>
  )
}
