import { notFound } from 'next/navigation'
import Link from 'next/link'
import { z } from 'zod'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/empty-state'
import { requirePermission } from '@/lib/guards'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { OperationsNav, RoundIntakeStatus } from '@/app/(site)/grants/_components/navigation'
import { RoundControls } from '@/app/(site)/grants/_components/round-controls'
import { RoundTable } from '@/app/(site)/grants/_components/round-table'
import { stateSchema, assessment, storedRoundChoice } from '@/app/(site)/grants/_lib/schemas'
import { reviewerOptions } from '@/app/(site)/grants/_lib/reviewers'
import { readiness } from '@/app/(site)/grants/_lib/rules'
export default async function RoundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    round?: string
    snapshot?: string
  }>
}) {
  const user = await requirePermission('grants.review'),
    query = await searchParams
  const rounds = await prisma.grantRound.findMany({
    where: { applications: { none: { project: { members: { some: { userId: user.id } } } } } },
    select: {
      id: true,
      name: true,
      published: true,
      revision: true,
      choices: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 100,
  })
  const round = rounds.find((r) => r.id === query.round) || (query.round ? undefined : rounds[0])
  if (query.round && !round) notFound()
  const [applications, snapshots, frozen] = round
    ? await Promise.all([
        prisma.grantApplication.findMany({
          where: {
            roundId: round.id,
            status: {
              not: 'draft',
            },
          },
          select: {
            id: true,
            state: true,
            projectVersion: {
              select: {
                name: true,
              },
            },
          },
        }),
        prisma.grantRoundSnapshot.findMany({
          where: {
            roundId: round.id,
          },
          select: {
            id: true,
            number: true,
            createdAt: true,
            note: true,
          },
          orderBy: {
            number: 'desc',
          },
          take: 100,
        }),
        query.snapshot
          ? prisma.grantRoundSnapshot.findFirst({
              where: {
                id: query.snapshot,
                roundId: round.id,
              },
              select: {
                data: true,
                note: true,
                createdAt: true,
              },
            })
          : null,
      ])
    : [[], [], null]
  if (query.snapshot && !frozen) notFound()
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
          holds: readiness(state, state.answers.terms.route),
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
      <nav className="mb-8 flex flex-wrap gap-3" aria-label="Grant rounds">
        {rounds.map((r) => (
          <Link
            key={r.id}
            href={`/admin/grants/rounds?round=${r.id}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm hover:border-brand"
          >
            {r.name}
          </Link>
        ))}
      </nav>
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
              <Link className="inline-flex min-h-11 items-center underline" href={`/admin/grants/rounds?round=${round.id}`}>
                Live review set
              </Link>
              {snapshots.map((snapshot) => (
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  key={snapshot.id}
                  href={`/admin/grants/rounds?round=${round.id}&snapshot=${snapshot.id}`}
                >
                  Snapshot v{snapshot.number} / {snapshot.createdAt.toISOString().slice(0, 10)}
                </Link>
              ))}
            </nav>
          </section>
        </div>
      )}
    </>
  )
}
