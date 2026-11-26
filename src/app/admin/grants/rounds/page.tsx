import { redirect } from 'next/navigation'
import { isFlagOn } from '@/lib/flag-store'
import Link from 'next/link'
import { z } from 'zod'
import { Pager } from '@/components/layout/pager'
import { pageParam, textParam } from '@/lib/params'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/empty-state'
import { requirePermission } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { GRANT_PAGE_SIZE, roundComparison } from '@/app/(site)/grants/_lib/queries'
import { RoundIntakeStatus } from '@/app/(site)/grants/_components/navigation'
import { OperationsNav } from '../_components/operations-nav'
import { RoundControls } from '@/app/(site)/grants/_components/round-controls'
import { RoundTable } from '@/app/(site)/grants/_components/round-table'
import { stateSchema, assessment, storedRoundChoice } from '@/app/(site)/grants/_lib/schemas'
import { reviewerOptions } from '@/app/(site)/grants/_lib/reviewers'
import { readiness } from '@/app/(site)/grants/_lib/rules'
export default async function RoundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    round?: string | string[]
    snapshot?: string | string[]
    page?: string | string[]
    snapshotPage?: string | string[]
  }>
}) {
  const user = await requirePermission('grants.review')
  if (!(await isFlagOn('grantsRoundManagement'))) redirect('/admin/grants')
  const query = await searchParams
  const roundId = textParam(query.round)
  const snapshotId = textParam(query.snapshot)
  const page = pageParam(query.page)
  const snapshotPage = pageParam(query.snapshotPage)
  const { rounds, round, applications, snapshots, frozen } = await roundComparison(roundId, snapshotId, page, snapshotPage)
  const roundHref = (id: string, snapshot?: string) => '/admin/grants/rounds?' + new URLSearchParams({
    round: id,
    ...(page > 1 ? { page: String(page) } : {}),
    ...(snapshot ? { snapshot, ...(snapshotPage > 1 ? { snapshotPage: String(snapshotPage) } : {}) } : {}),
  })
  const choices = z
    .record(z.string(), storedRoundChoice)
    .parse(frozen ? (frozen.data as { choices?: unknown }).choices : (round?.choices ?? {}))
  const frozenSchema = z.object({
    members: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        assessment,
        score: z.object({ total: z.number().nullable(), lower: z.number(), upper: z.number(), coverage: z.number() }),
        holds: z.array(z.string()),
      }),
    ),
  })
  const rows = frozen
    ? frozenSchema.parse(frozen.data).members
    : applications.map((a) => {
        const state = stateSchema.parse(a.state)
        return {
          id: a.id,
          name: a.projectVersion.name,
          assessment: state.assessment,
          holds: readiness(state, state.answers.intakeVersion === undefined ? state.answers.terms.route : undefined),
        }
      })
  const owners = await reviewerOptions(user)
  const manage = can(user, 'grants.manage')
  return (
    <>
      <PageHeader title="Round comparison" description="Evidence informs priority. Owners choose calls.">
        {manage && <RoundControls mode="create" ownerId={user.id} owners={owners} />}
      </PageHeader>
      <OperationsNav active="Rounds" />
      <nav className="flex flex-wrap gap-3" aria-label="Grant rounds">
        {rounds.slice(0, GRANT_PAGE_SIZE).map((r) => (
          <Link
            key={r.id}
            href={roundHref(r.id)}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:border-brand"
          >
            {r.name}
          </Link>
        ))}
      </nav>
      <div className="mb-8">
        <Pager page={page} hasMore={rounds.length > GRANT_PAGE_SIZE} params={{ round: round?.id, snapshot: snapshotId, snapshotPage: textParam(query.snapshotPage) }} />
      </div>
      {!round ? (
        <EmptyState title="No grant rounds">
          An authorised manager can create a closed round, then open it after programme approval.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg">{round.name}</h2>
              <div className="mt-2 space-y-2">
                {frozen
                  ? <p className="text-sm text-fg-muted">Read-only snapshot from {frozen.createdAt.toISOString().slice(0, 10)}</p>
                  : <RoundIntakeStatus open={round.published} />}
              </div>
            </div>
            {manage && !frozen && (
              <div className="flex flex-wrap gap-3">
                <RoundControls
                  mode="open"
                  roundId={round.id}
                  revision={round.revision}
                  published={round.published}
                  ownerId={user.id}
                  owners={owners}
                />
                <RoundControls mode="snapshot" roundId={round.id} revision={round.revision} ownerId={user.id} owners={owners} />
              </div>
            )}
          </div>
          {frozen && <p className="text-sm whitespace-pre-wrap">{frozen.note}</p>}
          <RoundTable rows={rows} />
          <section className="space-y-4">
            <h2 className="text-lg">Recorded owner choices</h2>
            {Object.entries(choices).map(([id, choice]) => (
              <div key={id} className="border-b border-line py-4">
                <h3>{rows.find((r) => r.id === id)?.name || 'Application'}</h3>
                <p className="mt-2">
                  {choice.disposition.replaceAll('_', ' ')} / {choice.rationale}
                </p>
                <p className="text-xs text-fg-muted">
                  {choice.at.slice(0, 10)} · {owners.find(({ value }) => value === choice.ownerId)?.label ?? 'Former reviewer'}
                </p>
                {choice.history.length > 0 && (
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm">Previous owner choices</summary>
                    {choice.history.map((h, i) => (
                      <p key={i} className="py-2 text-sm">
                        {h.at} / {h.disposition.replaceAll('_', ' ')} / {h.rationale}
                      </p>
                    ))}
                  </details>
                )}
              </div>
            ))}
            {!Object.keys(choices).length && <p className="text-sm text-fg-muted">No call-priority choice recorded.</p>}
          </section>
          {manage && !frozen && (
            <section className="space-y-4">
              <h2 className="text-lg">Record owner call priorities</h2>
              {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                  <span>{r.name}</span>
                  <RoundControls
                    mode="choice"
                    roundId={round.id}
                    revision={round.revision}
                    applicationId={r.id}
                    ownerId={user.id}
                    owners={owners}
                  />
                </div>
              ))}
            </section>
          )}
          <section>
            <h2 className="mb-4 text-lg">Frozen snapshots</h2>
            <nav className="flex flex-wrap gap-3">
              <Link className="inline-flex min-h-11 items-center underline" href={roundHref(round.id)}>
                Live review set
              </Link>
              {snapshots.slice(0, GRANT_PAGE_SIZE).map((snapshot) => (
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  key={snapshot.id}
                  href={roundHref(round.id, snapshot.id)}
                >
                  Snapshot v{snapshot.number} / {snapshot.createdAt.toISOString().slice(0, 10)}
                </Link>
              ))}
            </nav>
            <Pager page={snapshotPage} pageKey="snapshotPage" hasMore={snapshots.length > GRANT_PAGE_SIZE} params={{ round: round.id, snapshot: snapshotId, page: page > 1 ? String(page) : undefined }} />
          </section>
        </div>
      )}
    </>
  )
}
