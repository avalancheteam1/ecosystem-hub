import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { BackLink } from '@/components/back-link'
import { DataTable } from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { StatusPill } from '@/components/status-pill'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { ProjectVersionView } from '@/components/project-version-view'
import type { readApplication } from '../_lib/queries'
import { activeTerms, addDays, applicationStatus, applicationStatusCopy, readiness, score, statusLabel, totals } from '../_lib/rules'
import { reviewStatus, type Command } from '../_lib/schemas'
import { GrantCommandForm, type GrantField, type GrantRepeater } from './command-form'
import { applicationFields, assessmentFields, costRepeater, metricRepeater, options, termsFields } from './fields'
import { GrantTabs } from './navigation'
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(n / 100)
const note: GrantField = {
  path: 'note',
  label: 'Note shared with the applicant',
  type: 'textarea',
}
const evidence: GrantField = {
  path: 'evidence',
  label: 'Evidence reference',
}
export function GrantCaseView({
  data,
  requestedTab,
  checkpoint = '30',
}: {
  data: Awaited<ReturnType<typeof readApplication>>
  requestedTab?: string
  checkpoint?: string
}) {
  const s = data.state,
    internal = data.staff ? data.state : null,
    capabilities = data.staff ? data.capabilities : null
  const base = `${data.staff ? '/admin' : ''}/grants/applications/${data.id}`
  const tabs = data.staff
    ? [
        'Application',
        'Evidence',
        'Evaluation',
        'Requests',
        'Follow-ups',
        'Decision',
        'Amendments',
        'Delivery',
        'Payments',
        'Impact',
        'History',
      ]
    : ['Overview', 'Requests', 'Decision', 'Amendments', 'Delivery', 'Payments', 'Impact', 'History']
  const tab = tabs.includes(requestedTab || '') ? requestedTab! : tabs[0]
  const day = ['30', '90', '180'].includes(checkpoint) ? checkpoint : '30'
  const t = s.terms.at(-1),
    active = internal ? activeTerms(internal) : s.terms.findLast((r) => r.confirmedAt)
  const amounts = internal
    ? totals(internal)
    : data.staff
      ? {
          approved: 0,
          paid: 0,
          reserved: 0,
          remaining: 0,
        }
      : data.state.totals
  const ownerField: GrantField = { path: 'ownerId', label: 'Action owner', type: 'select', options: data.staff ? data.owners : [] }
  const publicStatus = data.staff ? applicationStatus(data.state) : data.state.applicantStatus
  const statusCopy = applicationStatusCopy[publicStatus.status]
  const maturity = PROJECT_MATURITY[data.projectVersion.maturity as ProjectMaturity]
  const workflowLabel = statusLabel(s, data.staff)
  const workflowTone = s.closedAt
    ? 'success'
    : /await|request|hold/i.test(workflowLabel)
      ? 'warning'
      : s.status === 'draft'
        ? 'neutral'
        : 'info'
  const form = (
    kind: Command['kind'],
    label: string,
    defaults: Record<string, unknown>,
    fields: GrantField[],
    dialog = false,
    repeaters: GrantRepeater[] = [],
  ) => (
    <GrantCommandForm
      key={`${data.id}:${data.revision}:${kind}`}
      applicationId={data.id}
      revision={data.revision}
      label={label}
      data={{
        kind,
        ...defaults,
      }}
      fields={fields}
      dialog={dialog}
      repeaters={repeaters}
    />
  )
  const termsView = (value: typeof s.answers.terms) => (
    <dl className="space-y-4">
      <div>
        <dt className="text-sm text-fg-muted">Milestone</dt>
        <dd>{value.title}</dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">Acceptance test</dt>
        <dd className="whitespace-pre-wrap">{value.acceptance}</dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">Amount / target date</dt>
        <dd>
          {usd(value.amountMinor)} / {value.due || 'Not set'}
        </dd>
      </div>
      <div>
        <dt className="text-sm text-fg-muted">Maintainer / verifier</dt>
        <dd>
          {value.maintainer || 'To agree'} / {value.verifier || 'To agree'}
        </dd>
      </div>
    </dl>
  )
  let content: React.ReactNode
  if (tab === 'Overview' || tab === 'Application')
    content = (
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-8">
          <h2 className="text-lg">Your application</h2>
          {data.writer && s.status === 'draft' ? (
            <>
              {form(
                'save_application',
                'Save draft',
                {
                  answers: s.answers,
                },
                applicationFields.map((f) => ({
                  ...f,
                  optional: true,
                })),
                false,
                [costRepeater()],
              )}
            </>
          ) : (
            <>
              {[
                ['Problem and beneficiaries', s.answers.problem],
                ['Avalanche outcome', s.answers.outcome],
                ['Execution capability', s.answers.capability],
                ['Other funding and cost basis', s.answers.funding],
                ['Maintenance and measurement', s.answers.maintenance],
                ['Risks and dependencies', s.answers.risks],
              ].map(([label, value]) => (
                <div key={label}>
                  <h3 className="text-base">{label}</h3>
                  <p className="mt-2 whitespace-pre-wrap">{value}</p>
                </div>
              ))}
              {termsView(s.answers.terms)}
              <DataTable
                id={`grants:${data.id}:costs`}
                columns={[
                  {
                    key: 'item',
                    label: 'Remaining cost',
                    hideable: false,
                  },
                  {
                    key: 'amount',
                    label: 'USD',
                  },
                ]}
                rows={s.answers.costs.map((c, i) => ({
                  id: String(i),
                  cells: {
                    item: c.title,
                    amount: usd(c.amountMinor),
                  },
                }))}
              />
            </>
          )}
        </section>
        <aside className="space-y-5 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <h2 className="text-lg">{data.staff ? 'Applicant visibility' : 'What happens next'}</h2>
          <p className="text-fg-muted">{statusCopy.detail}</p>
          {publicStatus.updateRequested && (
            <Link href={`${base}?tab=Requests`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
              {data.staff ? 'View outstanding requests' : 'Respond to evidence requests'}
            </Link>
          )}
          {s.status === 'approved' && (
            <Link href={`${base}?tab=${active ? 'Delivery' : 'Decision'}`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
              {active ? 'View delivery' : 'Review award terms'}
            </Link>
          )}
          {['deferred', 'not_selected'].includes(s.status) && (
            <Link href={`${base}?tab=Decision`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">Read decision note</Link>
          )}
          {data.writer && s.status === 'submitted' && form(
            'withdraw_application', 'Withdraw application', { confirm: false },
            [{ path: 'confirm', label: 'Withdraw this application from consideration.', type: 'checkbox' }], true,
          )}
        </aside>
      </div>
    )
  else if (tab === 'Evidence') content = <ProjectVersionView version={data.projectVersion} />
  else if (tab === 'Evaluation' && internal) {
    const result = score(internal.assessment),
      holds = readiness(internal, internal.answers.terms.route)
    content = (
      <div className="grid gap-10 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-5">
          <h2 className="text-lg">Evidence and context</h2>
          {termsView(s.answers.terms)}
          <Link href={`${base}?tab=Evidence`} className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
            Inspect the pinned project version
          </Link>
          <dl className="grid grid-cols-3 gap-3 border-y border-line py-4 text-sm">
            <div>
              <dt>Provisional</dt>
              <dd className="mt-1 text-xl">{result.total === null ? 'ND' : `${result.total.toFixed(1)} / 3`}</dd>
            </div>
            <div>
              <dt>Evidence bounds</dt>
              <dd className="mt-1 text-xl">
                {result.lower.toFixed(1)}-{result.upper.toFixed(1)}
              </dd>
            </div>
            <div>
              <dt>E coverage</dt>
              <dd className="mt-1 text-xl">{result.coverage}%</dd>
            </div>
          </dl>
          {holds.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <h3>Funding holds</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {holds.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </div>
          )}
          {capabilities?.review && s.status === 'submitted' &&
            form(
              'request_evidence',
              'Request evidence',
              {
                title: '',
                body: '',
              },
              [
                {
                  path: 'title',
                  label: 'Request title',
                },
                {
                  path: 'body',
                  label: 'What evidence is needed?',
                  type: 'textarea',
                },
                { path: 'due', label: 'Respond by (UTC)', type: 'date', optional: true },
              ],
              true,
            )}
        </section>
        <section>
          <h2 className="mb-5 text-lg">Evaluation</h2>
          <p className="mb-5 text-xs text-fg-muted">
            Internal framework v2.0 proposal. E is evidence-supported; S is stated. ND is unassessed. Scores never grant funding authority.
          </p>
          {capabilities?.review && s.status === 'submitted' ? (
            form(
              'save_assessment',
              'Save assessment',
              {
                assessment: internal.assessment,
              },
              assessmentFields,
            )
          ) : (
            <p>Assessment is read-only for this state or account.</p>
          )}
        </section>
      </div>
    )
  } else if (tab === 'Requests')
    content = !s.requests.length ? (
      <EmptyState title="No evidence requests">Requests for clarification will appear here.</EmptyState>
    ) : (
      <div className="space-y-8">
        {s.requests.map((r) => (
          <section key={r.id} className="space-y-4 border-b border-line pb-6">
            <h2 className="text-lg">{r.title}</h2>
            <p className="whitespace-pre-wrap">{r.body}</p>
            {r.due && <p className="text-sm text-fg-muted">Respond by <time dateTime={r.due}>{r.due}</time> (UTC)</p>}
            {r.answeredAt ? (
              <p className="border-l border-line pl-4 whitespace-pre-wrap">{r.reply}</p>
            ) : (
              data.writer && s.status === 'submitted' &&
              form(
                'answer_request',
                'Respond',
                {
                  requestId: r.id,
                  reply: '',
                },
                [
                  {
                    path: 'reply',
                    label: 'Response and supporting references',
                    type: 'textarea',
                  },
                ],
                true,
              )
            )}
          </section>
        ))}
      </div>
    )
  else if (tab === 'Decision')
    content = (
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-lg">Record the grant decision.</h2>
          <p>The amount and terms are decided separately from the score.</p>
          {s.decisions.map((decision, index) => (
            <section key={index} className="space-y-2 border-b border-line pb-4">
              <p className="text-sm font-medium">
                {applicationStatusCopy[decision.outcome].label} · <time dateTime={decision.at}>{decision.at.slice(0, 10)}</time>
              </p>
              <p className="whitespace-pre-wrap">{decision.publicNote}</p>
            </section>
          ))}
          {capabilities?.decide && s.status === 'deferred' && form(
            'reopen_application',
            'Reopen application',
            { confirm: false },
            [{ path: 'confirm', label: 'Return this application to review and keep the previous decision in its history.', type: 'checkbox' }],
            true,
          )}
          {internal && capabilities?.decide && s.status === 'submitted' ? (
            form(
              'record_decision',
              'Record authorised decision',
              {
                outcome: 'approved',
                terms: s.answers.terms,
                ownerId: data.userId,
                rationale: '',
                publicNote: '',
                budget: '',
                authority: '',
              },
              [
                {
                  path: 'outcome',
                  label: 'Decision outcome',
                  type: 'select',
                  options: options('approved', 'deferred', 'not_selected'),
                },
                ownerField,
                ...termsFields(),
                {
                  path: 'budget',
                  label: 'Budget authority reference',
                  optional: true,
                },
                {
                  path: 'authority',
                  label: 'Approval reference',
                },
                {
                  path: 'rationale',
                  label: 'Internal rationale',
                  type: 'textarea',
                },
                {
                  path: 'publicNote',
                  label: 'Applicant-facing note',
                  type: 'textarea',
                },
              ],
            )
          ) : s.decisions.length ? (
            <>
              {t && termsView(t.terms)}
              {t && (
                <p className="text-sm text-fg-muted">
                  Terms v{t.number}: {t.confirmedAt ? `Confirmed ${t.confirmedAt.slice(0, 10)}` : 'Awaiting applicant confirmation'}
                </p>
              )}
              {!data.staff &&
                data.writer &&
                t &&
                !t.confirmedAt &&
                form(
                  'confirm_terms',
                  'Confirm agreed terms',
                  {
                    confirm: false,
                  },
                  [
                    {
                      path: 'confirm',
                      label: 'I confirm the agreed milestone, amount and acceptance test.',
                      type: 'checkbox',
                    },
                  ],
                )}
            </>
          ) : (
            <EmptyState title="No decision recorded">An authorised decision will appear here when review is complete.</EmptyState>
          )}
        </section>
        <aside className="space-y-4 border-t border-line pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <h2 className="text-lg">Readiness and authority</h2>
          <p className="text-sm text-fg-muted">
            Evidence, eligibility, rights, conflicts, security, funding and continuity require review. A bounded pilot records a hypothesis
            and risk limits. Established impact requires c9 at least 2E.
          </p>
          {internal &&
            readiness(internal, s.answers.terms.route).map((r) => (
              <p key={r} className="text-sm">
                {r}
              </p>
            ))}
        </aside>
      </div>
    )
  else if (tab === 'Delivery') {
    const last = s.deliveries.at(-1)
    content = (
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-6">
          <h2 className="text-lg">Verify the agreed milestone.</h2>
          <p>Review the submitted evidence against the agreed terms.</p>
          {active ? termsView(active.terms) : <p>Confirm the terms before delivery.</p>}
          {s.deliveries.map((d, i) => (
            <section key={d.id} className="space-y-3 border-t border-line pt-5">
              <h3>
                Delivery v{i + 1} / terms v{d.termsVersion}
              </h3>
              <StatusPill className="text-fg-heading" tone={d.state === 'accepted' ? 'success' : 'info'}>{d.state.replaceAll('_', ' ')}</StatusPill>
              <p>
                <a
                  href={d.release}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Release and output
                </a>
              </p>
              <p>
                <a
                  href={d.reproduction}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Reproduction evidence
                </a>
              </p>
              <p>{d.note}</p>
              {d.review && <p className="text-sm text-fg-muted">Verifier note: {d.review.note}</p>}
            </section>
          ))}
        </section>
        <section>
          <h2 className="mb-5 text-lg">{data.staff ? 'Verification result' : 'Submit milestone delivery'}</h2>
          {data.staff && capabilities?.verify && last?.state === 'submitted' ? (
            form(
              'review_delivery',
              'Record verification',
              {
                deliveryId: last.id,
                outcome: 'accepted',
                inspected: false,
                reproduced: false,
                matches: false,
                note: '',
                evidence: '',
              },
              [
                {
                  path: 'outcome',
                  label: 'Outcome',
                  type: 'select',
                  options: options('accepted', 'changes_requested'),
                },
                note,
                evidence,
                {
                  path: 'inspected',
                  label: 'Agreed output inspected',
                  type: 'checkbox',
                },
                {
                  path: 'reproduced',
                  label: 'Acceptance test reproduced',
                  type: 'checkbox',
                },
                {
                  path: 'matches',
                  label: 'Scope and version match',
                  type: 'checkbox',
                },
              ],
            )
          ) : !data.staff && data.writer && active && !['submitted', 'accepted'].includes(last?.state || '') ? (
            form(
              'submit_delivery',
              'Submit delivery evidence',
              {
                release: '',
                reproduction: '',
                note: '',
              },
              [
                {
                  path: 'release',
                  label: 'Release and output URL',
                },
                {
                  path: 'reproduction',
                  label: 'Reproduction evidence URL',
                },
                note,
              ],
            )
          ) : (
            <p className="text-sm text-fg-muted">
              {last?.state === 'submitted'
                ? 'Awaiting verification.'
                : last?.state === 'accepted'
                  ? 'Milestone accepted.'
                  : 'Delivery is not ready for a new action.'}
            </p>
          )}
        </section>
      </div>
    )
  } else if (tab === 'Payments')
    content = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg">Track external payments.</h2>
            <p className="mt-2">Record evidence of payments made through the authorised finance process.</p>
          </div>
          {capabilities?.payments &&
            form(
              'report_payment',
              'Record payment report',
              {
                reference: '',
                amountMinor: 0,
                date: '',
                evidence: '',
                note: '',
              },
              [
                {
                  path: 'reference',
                  label: 'Unique external payment reference',
                },
                {
                  path: 'amountMinor',
                  label: 'Payment amount (USD)',
                  type: 'money',
                },
                {
                  path: 'date',
                  label: 'Payment date (UTC calendar day)',
                  type: 'date',
                },
                evidence,
                note,
              ],
              true,
            )}
        </div>
        <dl className="grid gap-5 border-y border-line py-5 sm:grid-cols-3">
          {[
            ['Approved', amounts.approved],
            ['Confirmed paid', amounts.paid],
            ['Remaining obligation', amounts.remaining],
          ].map(([label, value]) => (
            <div key={label}>
              <dd className="text-3xl">{usd(Number(value))}</dd>
              <dt className="mt-1 text-sm text-fg-muted">{label}</dt>
            </div>
          ))}
        </dl>
        <DataTable
          id={`grant:${data.id}:payments`}
          columns={[
            {
              key: 'amount',
              label: 'Amount (USD)',
              hideable: false,
            },
            {
              key: 'date',
              label: 'Payment date',
            },
            {
              key: 'status',
              label: 'Status',
            },
            ...(capabilities?.payments
              ? [
                  {
                    key: 'reference',
                    label: 'Reference',
                  },
                  {
                    key: 'action',
                    label: 'Reconciliation',
                  },
                ]
              : []),
          ]}
          rows={s.payments.map((p) => {
            const finance = internal?.payments.find((r) => r.id === p.id)
            return {
              id: p.id,
              cells: {
                amount: usd(p.amountMinor),
                date: p.date,
                status: (
                  <StatusPill className="text-fg-heading" tone={p.state === 'confirmed' ? 'success' : p.state === 'reported' ? 'warning' : 'neutral'}>
                    {p.state}
                  </StatusPill>
                ),
                reference: capabilities?.payments ? finance?.reference : null,
                action:
                  capabilities?.payments && finance
                    ? form(
                        'reconcile_payment',
                        'Reconcile record',
                        {
                          paymentId: p.id,
                          state: p.state === 'confirmed' ? 'reversed' : 'confirmed',
                          evidence: finance.evidence,
                          note: '',
                        },
                        [
                          {
                            path: 'state',
                            label: 'Reconciled status',
                            type: 'select',
                            options: options(
                              ...(p.state === 'confirmed'
                                ? ['reversed', 'disputed']
                                : ['confirmed', 'uncertain', 'failed', 'reversed', 'disputed']),
                            ),
                          },
                          evidence,
                          note,
                        ],
                        true,
                      )
                    : null,
              },
            }
          })}
        />
        <p className="text-sm text-fg-muted">
          Only confirmed settlement counts as paid. Reported, uncertain and disputed payments stay reserved until reconciled. No money is
          sent by this module.
        </p>
      </div>
    )
  else if (tab === 'Amendments')
    content = (
      <div className="space-y-8">
        <h2 className="text-lg">Review proposed changes to agreed terms.</h2>
        <p>Current terms remain active until renewed review and applicant confirmation.</p>
        {active && termsView(active.terms)}
        {s.amendments.map((a) => (
          <section key={a.id} className="space-y-5 border-t border-line pt-6">
            <h3>Proposed amendment / base terms v{a.baseVersion}</h3>
            <StatusPill className="text-fg-heading" tone={a.state === 'confirmed' ? 'success' : 'info'}>{a.state.replaceAll('_', ' ')}</StatusPill>
            {termsView(a.terms)}
            <p>{a.reason}</p>
            {a.review && <p>Reviewer: {a.review}</p>}
            {capabilities?.decide &&
              a.state === 'submitted' &&
              form(
                'review_amendment',
                'Review amendment',
                {
                  amendmentId: a.id,
                  state: 'approved',
                  renewed: false,
                  review: '',
                  authority: '',
                },
                [
                  {
                    path: 'state',
                    label: 'Outcome',
                    type: 'select',
                    options: options('approved', 'changes_requested'),
                  },
                  {
                    path: 'review',
                    label: 'Renewed scope, funding and risk review shared with applicant',
                    type: 'textarea',
                  },
                  {
                    path: 'authority',
                    label: 'Renewed approval reference',
                  },
                  {
                    path: 'renewed',
                    label: 'I reviewed current scope, funding overlap, rights, conflicts and risks for the amended terms.',
                    type: 'checkbox',
                  },
                ],
                true,
              )}
            {!data.staff &&
              data.writer &&
              ['submitted', 'changes_requested', 'approved'].includes(a.state) &&
              form(
                'respond_amendment',
                'Respond to amendment',
                {
                  amendmentId: a.id,
                  response: a.state === 'approved' ? 'confirmed' : 'withdrawn',
                  note: '',
                },
                [
                  {
                    path: 'response',
                    label: 'Response',
                    type: 'select',
                    options: options(...(a.state === 'approved' ? ['confirmed', 'declined', 'withdrawn'] : ['withdrawn'])),
                  },
                  note,
                ],
                true,
              )}
          </section>
        ))}
        {!data.staff &&
          data.writer &&
          active &&
          !s.payments.length &&
          !['submitted', 'accepted'].includes(s.deliveries.at(-1)?.state || '') &&
          form(
            'submit_amendment',
            'Propose amended terms',
            {
              terms: active.terms,
              reason: '',
            },
            [
              ...termsFields(),
              {
                path: 'reason',
                label: 'What changed and why?',
                type: 'textarea',
              },
            ],
            true,
          )}
      </div>
    )
  else if (tab === 'Follow-ups' && internal)
    content = (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg">Every case has a next useful action.</h2>
          {capabilities?.review &&
            form(
              'save_followup',
              'Add follow-up',
              {
                title: '',
                ownerId: data.userId,
                due: '',
                waitingOn: 'Reviewer',
                note: '',
              },
              [
                {
                  path: 'title',
                  label: 'Next action',
                },
                ownerField,
                {
                  path: 'due',
                  label: 'Due date (UTC calendar day)',
                  type: 'date',
                },
                {
                  path: 'waitingOn',
                  label: 'Waiting on',
                },
                {
                  ...note,
                  label: 'Internal progress note',
                },
              ],
              true,
            )}
        </div>
        {internal.followups.map((f) => (
          <section key={f.id} className="space-y-4 border-t border-line pt-5">
            <h3>{f.title}</h3>
            <p className="text-sm text-fg-muted">
              {f.state} / due {f.due} / waiting on {f.waitingOn}
            </p>
            <p>{f.note}</p>
            {f.reminderDraft && (
              <div className="rounded-lg border border-line p-4">
                <StatusPill className="text-fg-heading" tone="warning">Pending review / Unsent</StatusPill>
                <p className="mt-2 whitespace-pre-wrap">{f.reminderDraft}</p>
              </div>
            )}
            {capabilities?.review && (
              <div className="flex flex-wrap gap-3">
                {form(
                  'save_followup',
                  'Reschedule or update',
                  {
                    followupId: f.id,
                    title: f.title,
                    ownerId: f.ownerId,
                    due: f.due,
                    waitingOn: f.waitingOn,
                    note: '',
                  },
                  [
                    {
                      path: 'title',
                      label: 'Next action',
                    },
                    {
                      path: 'due',
                      label: 'Due date',
                      type: 'date',
                    },
                    {
                      path: 'waitingOn',
                      label: 'Waiting on',
                    },
                    {
                      ...note,
                      label: 'Reason or progress note',
                    },
                  ],
                  true,
                )}
                {form(
                  'finish_followup',
                  f.state === 'open' ? 'Complete action' : 'Reopen action',
                  {
                    followupId: f.id,
                    reopen: f.state !== 'open',
                    note: '',
                  },
                  [
                    {
                      ...note,
                      label: 'Completion or reopening note',
                    },
                  ],
                  true,
                )}
                {f.state === 'open' &&
                  form(
                    'draft_reminder',
                    'Draft reminder',
                    {
                      followupId: f.id,
                      body: f.reminderDraft,
                    },
                    [
                      {
                        path: 'body',
                        label: 'Reminder draft / not sent',
                        type: 'textarea',
                      },
                    ],
                    true,
                  )}
              </div>
            )}
          </section>
        ))}
      </div>
    )
  else if (tab === 'Impact') {
    const report = s.impact.findLast((r) => r.day === day),
      accepted = s.deliveries.findLast((d) => d.state === 'accepted')
    content = (
      <div className="space-y-8">
        <nav className="grid gap-3 sm:grid-cols-3" aria-label="Impact checkpoints">
          {['30', '90', '180'].map((d) => {
            const r = s.impact.findLast((r) => r.day === d)
            return (
              <Link
                href={`${base}?tab=Impact&day=${d}`}
                key={d}
                aria-current={day === d ? 'page' : undefined}
                className={`min-h-11 rounded-lg border p-4 text-sm ${day === d ? 'border-brand' : 'border-line'}`}
              >
                {d} days / {r?.state || 'Awaiting update'}
              </Link>
            )
          })}
        </nav>
        <h2 className="text-lg">
          {data.staff ? 'Review' : 'Your'} {day}-day update.
        </h2>
        {accepted?.review?.at && (
          <p className="text-sm text-fg-muted">
            Due {addDays(accepted.review.at.slice(0, 10), Number(day))}. Checkpoints are anchored to accepted delivery, not award date.
          </p>
        )}
        {s.impactPlan ? (
          <>
            <DataTable
              id={`grant:${data.id}:impact:${day}`}
              columns={[
                {
                  key: 'metric',
                  label: 'Agreed metric',
                  hideable: false,
                },
                {
                  key: 'baseline',
                  label: 'Baseline',
                },
                {
                  key: 'target',
                  label: 'Target',
                },
                {
                  key: 'observed',
                  label: 'Observed',
                },
              ]}
              rows={s.impactPlan.metrics.map((m) => ({
                id: m.id,
                cells: {
                  metric: `${m.name} (${m.unit})`,
                  baseline: m.baseline,
                  target: m.target,
                  observed: report?.observations.find((o) => o.metricId === m.id)?.value ?? 'Unmeasured',
                },
              }))}
            />
            {report && (
              <div className="space-y-3">
                <StatusPill className="text-fg-heading" tone={report.state === 'reviewed' ? 'success' : 'info'}>{report.state}</StatusPill>
                <p className="whitespace-pre-wrap">{report.narrative}</p>
                {report.observations.map((o) => (
                  <p key={o.metricId} className="text-sm">
                    {o.metricId}: {o.value === null ? 'Unmeasured' : o.value} / {o.evidence || 'No measurement evidence'} / {o.method}
                  </p>
                ))}
                {report.review && <p>Review: {report.review}</p>}
              </div>
            )}
            {!data.staff &&
              data.writer &&
              !['submitted', 'reviewed'].includes(report?.state || '') &&
              form(
                'save_impact',
                'Save impact update',
                {
                  day,
                  observations: s.impactPlan.metrics.map(
                    (m) =>
                      report?.observations.find((o) => o.metricId === m.id) || {
                        metricId: m.id,
                        value: null,
                        evidence: '',
                        method: m.method,
                      },
                  ),
                  narrative: report?.narrative || '',
                  submit: false,
                },
                [
                  ...s.impactPlan.metrics.flatMap((m, i): GrantField[] => [
                    {
                      path: `observations.${i}.value`,
                      label: `${m.name}: observed (${m.unit}) / blank means unmeasured`,
                      type: 'number',
                      optional: true,
                    },
                    {
                      path: `observations.${i}.evidence`,
                      label: `${m.name}: evidence reference`,
                      optional: true,
                    },
                    {
                      path: `observations.${i}.method`,
                      label: `${m.name}: measurement method`,
                      type: 'textarea',
                      optional: true,
                    },
                  ]),
                  {
                    path: 'narrative',
                    label: 'What changed, what did not, and lessons',
                    type: 'textarea',
                  },
                  {
                    path: 'submit',
                    label: 'Submit this update for review. Leave unchecked to save a draft.',
                    type: 'checkbox',
                  },
                ],
              )}
            {capabilities?.review &&
              report?.state === 'submitted' &&
              form(
                'review_impact',
                'Record impact review',
                {
                  impactId: report.id,
                  state: 'reviewed',
                  review: '',
                },
                [
                  {
                    path: 'state',
                    label: 'Review outcome',
                    type: 'select',
                    options: options('reviewed', 'clarification'),
                  },
                  {
                    path: 'review',
                    label: 'Evidence basis and findings shared with applicant',
                    type: 'textarea',
                  },
                ],
              )}
            {capabilities?.review &&
              form(
                'close_impact',
                'Record supported close-out',
                {
                  note: '',
                },
                [
                  {
                    ...note,
                    label: 'Supported outcome narrative',
                  },
                ],
                true,
              )}
          </>
        ) : capabilities?.review && accepted ? (
          form(
            'set_impact_plan',
            'Save monitoring plan',
            {
              ownerId: data.userId,
              metrics: [
                {
                  id: 'metric-1',
                  name: '',
                  unit: '',
                  baseline: 0,
                  target: 0,
                  method: '',
                },
              ],
            },
            [ownerField],
            false,
            [metricRepeater],
          )
        ) : (
          <EmptyState title="No monitoring plan yet">A project-specific plan is recorded after accepted delivery.</EmptyState>
        )}
      </div>
    )
  } else
    content = (
      <div className="space-y-5">
        <h2 className="text-lg">Application history</h2>
        {s.applications.map((a, i) => (
          <div key={a.id} className="border-b border-line py-4">
            <h3>Application v{i + 1}</h3>
            <p className="text-sm text-fg-muted">
              {a.at} / pinned project version {a.projectVersionId}
            </p>
          </div>
        ))}
        {!data.staff && s.statusReleases.map((release) => (
          <p key={release.id} className="text-sm text-fg-muted">
            <time dateTime={release.at}>{release.at.slice(0, 10)}</time> / {applicationStatusCopy[release.status].label}
          </p>
        ))}
        {internal?.events.map((e) => (
          <p key={e.id} className="text-sm text-fg-muted">
            {e.at} / {e.kind.replaceAll('_', ' ')} / {e.note}
          </p>
        ))}
        {!s.applications.length && <p className="text-sm text-fg-muted">No submission has been recorded.</p>}
      </div>
    )
  return (
    <div className={data.staff ? 'min-w-0' : 'container-page py-10'}>
      <BackLink href={data.staff ? '/admin/grants' : '/grants/applications'}>{data.staff ? 'Review queue' : 'All applications'}</BackLink>
      <PageHeader title={data.name} description={`Mini Grants / ${data.round}`}>
        {capabilities?.decide && s.status === 'submitted' && form(
          'release_review_status',
          'Release application status',
          { status: '' },
          [{
            path: 'status',
            label: 'Status to show the applicant',
            hint: 'The applicant can see this status immediately after you release it.',
            type: 'select',
            options: reviewStatus.options.filter((status) => status !== publicStatus.status)
              .map((value) => ({ value, label: applicationStatusCopy[value].label })),
          }],
          true,
        )}
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xl">
          {usd(active?.terms.amountMinor ?? t?.terms.amountMinor ?? s.answers.terms.amountMinor)} {s.status === 'approved' ? 'approved' : 'requested'}
        </span>
        {maturity && <StatusPill className="text-fg-heading" tone="neutral">Project stage {maturity.label}</StatusPill>}
        <StatusPill className="text-fg-heading" tone={s.status === 'approved' ? 'success' : 'info'}>{statusCopy.label}</StatusPill>
        {publicStatus.updateRequested && <StatusPill className="text-fg-heading" tone="warning">Update requested</StatusPill>}
        {s.status === 'approved' && <StatusPill className="text-fg-heading" tone={workflowTone}>{workflowLabel}</StatusPill>}
      </div>
      <GrantTabs base={base} active={tab} items={tabs} />
      {s.closedAt && (
        <p className="mb-6 rounded-lg border border-line p-4 text-sm">
          Outcome close-out recorded {s.closedAt.slice(0, 10)}. History remains available.
        </p>
      )}
      {content}
    </div>
  )
}
