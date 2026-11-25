import { describe, expect, it } from 'vitest'
import {
  answers,
  commandSchema,
  criterionIds,
  clearanceIds,
  money,
  hasDemoProof,
  stateSchema,
  type GrantState,
  type Command,
} from '@/app/(site)/grants/_lib/schemas'
import {
  activeTerms,
  addDays,
  applicantProjection,
  applicationStatus,
  initialState,
  mayCommand,
  readiness,
  score,
  totals,
  transition,
} from '@/app/(site)/grants/_lib/rules'
import type { Permission } from '@/lib/permissions'

const now = '2026-11-12T12:00:00.000Z'
const fields = () =>
  answers.parse({
    problem: 'A real problem',
    outcome: 'A useful Avalanche output',
    capability: 'Maintainer and implementation evidence',
    funding: 'No overlapping support reported',
    maintenance: 'Maintainer and measurement plan',
    risks: 'Testnet dependencies',
    costs: [{ title: 'Remaining delivery work', amountMinor: 500000 }],
    terms: {
      title: 'Ship a reproducible quickstart',
      acceptance: 'An independent developer reproduces the example',
      amountMinor: 500000,
      due: '2026-12-01',
      maintainer: 'Project team',
      verifier: 'Independent verifier',
      route: 'bounded_pilot',
      hypothesis: 'Useful independent adoption',
      limits: 'Testnet only',
    },
  })
let event = 0
const change = (s: GrantState, command: Command, at = now) =>
  transition(s, command, { id: `event-${++event}`, actorId: 'reviewer', now: at, projectVersionId: 'project-version-1' })
function reviewed() {
  const s = change(initialState(fields()), { kind: 'submit_application', confirm: true })
  for (const id of criterionIds)
    s.assessment.criteria[id] = {
      score: id === 'c9' ? '0' : '2',
      basis: 'E',
      source: 'Observed repository and test evidence',
      rationale: 'Matches the bounded scope',
    }
  for (const id of clearanceIds) s.assessment.clearances[id] = { state: 'pass', evidence: 'Reviewed scope and authority' }
  return change(s, { kind: 'save_assessment', assessment: s.assessment })
}
function approved() {
  const s = reviewed()
  return change(s, {
    kind: 'record_decision',
    outcome: 'approved',
    terms: fields().terms,
    rationale: 'Bounded remaining output',
    publicNote: 'Agree these terms',
    ownerId: 'reviewer',
    budget: 'budget-1',
    authority: 'approval-1',
  })
}
function confirmed() {
  return change(approved(), { kind: 'confirm_terms', confirm: true })
}
function accepted() {
  let s = change(confirmed(), {
    kind: 'submit_delivery',
    release: 'https://example.test/release',
    reproduction: 'https://example.test/test',
    note: 'Ready for independent inspection',
  })
  s = change(s, {
    kind: 'review_delivery',
    deliveryId: s.deliveries[0].id,
    outcome: 'accepted',
    inspected: true,
    reproduced: true,
    matches: true,
    note: 'Acceptance reproduced',
    evidence: 'verification-1',
  })
  return s
}
const report = (reference = 'payment-1', amountMinor = 200000): Command => ({
  kind: 'report_payment',
  reference,
  amountMinor,
  date: '2026-11-12',
  evidence: 'https://example.test/settlement',
  note: 'External finance report',
})

describe('grant money and dates', () => {
  it('uses integer cents and rejects fractional cents, exponent notation and unsafe amounts', () => {
    expect(money.parse('12.34')).toBe(1234)
    for (const s of ['1.005', '1e3', '-1', '10000.01', 'NaN']) expect(money.safeParse(s).success).toBe(false)
  })
  it('validates real UTC calendar days and handles DST/year boundaries', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(commandSchema.safeParse({ ...report(), date: '2026-02-30' }).success).toBe(false)
  })
})
describe('grant assessment and authority', () => {
  it('ND suppresses total while keeping fixed weighted evidence bounds', () => {
    const s = reviewed()
    s.assessment.criteria.c9.score = 'ND'
    expect(score(s.assessment)).toEqual({ total: null, lower: 1.6, upper: 2.2, coverage: 80 })
  })
  it('S scores change the provisional value without establishing E bounds', () => {
    const s = reviewed()
    s.assessment.criteria.c6.basis = 'S'
    const r = score(s.assessment)
    expect(r.total).toBe(1.6)
    expect(r.lower).toBe(1.4)
    expect(r.upper).toBe(1.7)
    expect(r.coverage).toBe(90)
  })
  it('a high provisional score cannot clear a required evidence hold', () => {
    const s = reviewed()
    s.assessment.criteria.c6 = { score: '3', basis: 'S', source: 'Applicant claim', rationale: 'Not independently corroborated' }
    expect(readiness(s, 'bounded_pilot')).toContain('c6: at least 2E required')
    expect(() =>
      change(s, {
        kind: 'record_decision',
        outcome: 'approved',
        terms: fields().terms,
        rationale: 'Test',
        publicNote: 'Test',
        ownerId: 'reviewer',
        budget: 'budget',
        authority: 'authority',
      }),
    ).toThrow('c6')
  })
  it('requires supporting rationale, readiness evidence and c9 only for established impact', () => {
    const s = reviewed()
    expect(readiness(s, 'bounded_pilot')).toEqual([])
    expect(readiness(s, 'established_impact')).toContain('Established impact requires c9 at least 2E')
    s.assessment.criteria.c2.source = ''
    s.assessment.clearances.rights.evidence = ''
    expect(readiness(s, 'bounded_pilot')).toEqual(
      expect.arrayContaining(['c2: source and rationale required', 'rights: unresolved readiness']),
    )
  })
  it('requires renewed assessment after an applicant response and never trusts a client version stamp', () => {
    let s = reviewed()
    s = change(s, { kind: 'request_evidence', title: 'Cost basis', body: 'Please clarify the cost basis' })
    s = change(s, { kind: 'answer_request', requestId: s.requests[0].id, reply: 'New evidence reference' })
    expect(readiness(s, 'bounded_pilot')).toContain('Review the assessment against the current submitted project version')
    s = change(s, { kind: 'save_assessment', assessment: s.assessment })
    expect(readiness(s, 'bounded_pilot')).toEqual([])
  })
  it('keeps original application fields and decisions immutable across subsequent changes', () => {
    const s = approved(),
      before = structuredClone(s)
    const next = change(s, { kind: 'confirm_terms', confirm: true })
    expect(s).toEqual(before)
    expect(next.decisions).toEqual(before.decisions)
    expect(next.applications[0].answers).toEqual(fields())
    expect(() => change(next, { kind: 'save_application', answers: fields() })).toThrow('immutable')
  })
  it('requires current object membership and keeps funding/payment powers separate', () => {
    const reviewer = { isSuperAdmin: false, permissions: new Set<Permission>(['grants.review']) }
    expect(mayCommand(reviewer, 'save_assessment', null)).toBe(true)
    expect(mayCommand(reviewer, 'record_decision', null)).toBe(false)
    expect(mayCommand(reviewer, 'review_delivery', null)).toBe(false)
    expect(mayCommand(reviewer, 'report_payment', null)).toBe(false)
    expect(mayCommand(reviewer, 'submit_delivery', 'reader')).toBe(false)
    expect(mayCommand(reviewer, 'submit_delivery', 'writer')).toBe(true)
    expect(mayCommand(reviewer, 'submit_delivery', null)).toBe(false)
  })
  it('accepts incomplete drafts but refuses to submit them', () => {
    const s = initialState(fields())
    s.answers.problem = ''
    expect(stateSchema.safeParse(s).success).toBe(true)
    expect(() => change(s, { kind: 'submit_application', confirm: true })).toThrow()
  })
})
describe('delivery and payment reconciliation', () => {
  it('requires confirmed terms and independently completed acceptance checks', () => {
    expect(() =>
      change(approved(), {
        kind: 'submit_delivery',
        release: 'https://example.test/release',
        reproduction: 'https://example.test/test',
        note: 'Done',
      }),
    ).toThrow('Confirm')
    const s = change(confirmed(), {
      kind: 'submit_delivery',
      release: 'https://example.test/release',
      reproduction: 'https://example.test/test',
      note: 'Done',
    })
    expect(() =>
      change(s, {
        kind: 'review_delivery',
        deliveryId: s.deliveries[0].id,
        outcome: 'accepted',
        inspected: true,
        reproduced: false,
        matches: true,
        note: 'Not reproduced',
        evidence: 'test',
      }),
    ).toThrow('All acceptance')
  })
  it('reserves reports and counts only confirmed settlement as paid', () => {
    let s = accepted()
    s = change(s, report())
    expect(totals(s)).toEqual({ approved: 500000, paid: 0, reserved: 200000, remaining: 500000 })
    s = change(s, {
      kind: 'reconcile_payment',
      paymentId: s.payments[0].id,
      state: 'confirmed',
      evidence: 'https://example.test/receipt',
      note: 'Reconciled',
    })
    expect(totals(s)).toEqual({ approved: 500000, paid: 200000, reserved: 0, remaining: 300000 })
  })
  it('allows a reversal after outcome close-out and reopens the obligation without erasing the closed history', () => {
    let s = change(accepted(), report('settled', 500000))
    s = change(s, {
      kind: 'reconcile_payment',
      paymentId: s.payments[0].id,
      state: 'confirmed',
      evidence: 'https://example.test/settled',
      note: 'Reconciled',
    })
    s = change(s, {
      kind: 'set_impact_plan',
      ownerId: 'reviewer',
      metrics: [{ id: 'one', name: 'Outcome', unit: 'users', baseline: 0, target: 1, method: 'Independent evidence' }],
    })
    const later = '2027-06-01T12:00:00.000Z'
    for (const day of ['30', '90', '180'] as const) {
      s = change(
        s,
        {
          kind: 'save_impact',
          day,
          observations: [{ metricId: 'one', value: null, evidence: '', method: '' }],
          narrative: 'Unmeasured with a supported limitation',
          submit: true,
        },
        later,
      )
      s = change(
        s,
        {
          kind: 'review_impact',
          impactId: s.impact.at(-1)!.id,
          state: 'reviewed',
          review: 'Limitation accepted; no claim of measured impact',
        },
        later,
      )
    }
    s = change(s, { kind: 'close_impact', note: 'Supported close-out' }, later)
    expect(s.closedAt).toBe(later)
    s = change(
      s,
      {
        kind: 'reconcile_payment',
        paymentId: s.payments[0].id,
        state: 'reversed',
        evidence: 'https://example.test/reversed',
        note: 'External reversal after close-out',
      },
      later,
    )
    expect(s.closedAt).toBeNull()
    expect(totals(s).remaining).toBe(500000)
    expect(s.events.some((e) => e.kind === 'close_impact')).toBe(true)
  })
  it('rejects over-reserving, duplicate references and payment before acceptance', () => {
    expect(() => change(confirmed(), report())).toThrow('Accept')
    const s = change(accepted(), report('one', 400000))
    expect(() => change(s, report('two', 200000))).toThrow('unreserved')
    expect(() => change(s, report('one', 100000))).toThrow('already recorded')
  })
  it('cannot reactivate a failed payment over another reserved replacement', () => {
    let s = change(accepted(), report('old', 200000))
    s = change(s, {
      kind: 'reconcile_payment',
      paymentId: s.payments[0].id,
      state: 'failed',
      evidence: 'https://example.test/failed',
      note: 'Failed externally',
    })
    s = change(s, report('replacement', 500000))
    expect(() =>
      change(s, {
        kind: 'reconcile_payment',
        paymentId: s.payments[0].id,
        state: 'confirmed',
        evidence: 'https://example.test/late',
        note: 'Late confirmation',
      }),
    ).toThrow('exceed')
    expect(() =>
      change(s, {
        kind: 'reconcile_payment',
        paymentId: s.payments[0].id,
        state: 'disputed',
        evidence: 'https://example.test/disputed',
        note: 'Late dispute',
      }),
    ).toThrow('exceed')
  })
  it('reversals reopen the obligation and preserve previous receipts', () => {
    let s = change(accepted(), report())
    s = change(s, {
      kind: 'reconcile_payment',
      paymentId: s.payments[0].id,
      state: 'confirmed',
      evidence: 'https://example.test/confirmed',
      note: 'Confirmed',
    })
    const before = structuredClone(s)
    s = change(s, {
      kind: 'reconcile_payment',
      paymentId: s.payments[0].id,
      state: 'reversed',
      evidence: 'https://example.test/reversal',
      note: 'Reversed externally',
    })
    expect(totals(s).remaining).toBe(500000)
    expect(before.payments[0].state).toBe('confirmed')
    expect(s.decisions).toEqual(before.decisions)
  })
})
describe('amendments', () => {
  it('does not activate approved amended terms until applicant confirmation', () => {
    const original = confirmed(),
      nextTerms = { ...fields().terms, amountMinor: 600000, title: 'Revised scope' }
    let s = change(original, { kind: 'submit_amendment', terms: nextTerms, reason: 'New remaining work' })
    s = change(s, {
      kind: 'review_amendment',
      amendmentId: s.amendments[0].id,
      state: 'approved',
      renewed: true,
      review: 'Renewed checks',
      authority: 'renewed-authority',
    })
    expect(activeTerms(s)?.terms.amountMinor).toBe(500000)
    expect(() =>
      change(s, {
        kind: 'submit_delivery',
        release: 'https://example.test/release',
        reproduction: 'https://example.test/test',
        note: 'Done',
      }),
    ).toThrow('amendments')
    s = change(s, { kind: 'respond_amendment', amendmentId: s.amendments[0].id, response: 'confirmed', note: 'Agreed' })
    expect(activeTerms(s)?.number).toBe(2)
    expect(activeTerms(s)?.terms.amountMinor).toBe(600000)
    expect(s.terms[0]).toEqual(original.terms[0])
    expect(s.decisions).toEqual(original.decisions)
  })
  it('refuses amendments after acceptance or payment records', () => {
    expect(() => change(accepted(), { kind: 'submit_amendment', terms: fields().terms, reason: 'Change' })).toThrow(
      'before delivery acceptance',
    )
  })
})
describe('monitoring and follow-ups', () => {
  const impactTime = '2027-06-01T12:00:00.000Z'
  const impactChange = (s: GrantState, c: Command) => change(s, c, impactTime)
  const plan = () =>
    change(accepted(), {
      kind: 'set_impact_plan',
      ownerId: 'reviewer',
      metrics: [
        {
          id: 'developers',
          name: 'Independent developers',
          unit: 'developers',
          baseline: 0,
          target: 3,
          method: 'Count independent reproductions',
        },
      ],
    })
  it('allows early impact drafts but blocks submission until the checkpoint is due', () => {
    const s = plan()
    const command: Command = {
      kind: 'save_impact',
      day: '180',
      observations: [{ metricId: 'developers', value: null, evidence: '', method: '' }],
      narrative: 'Draft preparation',
      submit: false,
    }
    expect(change(s, command).impact[0].state).toBe('draft')
    expect(() => change(s, { ...command, submit: true })).toThrow('not due yet')
    expect(impactChange(s, { ...command, submit: true }).impact[0].state).toBe('submitted')
  })
  it('requires evidence for measured zero; blanks remain unmeasured', () => {
    const s = plan()
    const command: Command = {
      kind: 'save_impact',
      day: '180',
      observations: [{ metricId: 'developers', value: 0, evidence: '', method: '' }],
      narrative: 'No observed change',
      submit: true,
    }
    expect(() => impactChange(s, command)).toThrow('evidence and method')
    const next = impactChange(s, { ...command, observations: [{ metricId: 'developers', value: null, evidence: '', method: '' }] })
    expect(next.impact[0].observations[0].value).toBeNull()
  })
  it('retains prior impact revisions and never changes c9 automatically', () => {
    let s = plan()
    const originalScore = structuredClone(s.assessment.criteria.c9)
    s = impactChange(s, {
      kind: 'save_impact',
      day: '30',
      observations: [{ metricId: 'developers', value: 1, evidence: 'https://example.test/one', method: 'Independent reproduction' }],
      narrative: 'First outcome',
      submit: true,
    })
    s = impactChange(s, { kind: 'review_impact', impactId: s.impact[0].id, state: 'clarification', review: 'Add method details' })
    s = impactChange(s, {
      kind: 'save_impact',
      day: '30',
      observations: [{ metricId: 'developers', value: 1, evidence: 'https://example.test/one', method: 'Expanded method' }],
      narrative: 'Clarified',
      submit: true,
    })
    expect(s.impact).toHaveLength(2)
    expect(s.impact[0].state).toBe('clarification')
    expect(s.assessment.criteria.c9).toEqual(originalScore)
    expect(() => change(s, { kind: 'close_impact', note: 'Close' })).toThrow('all three')
  })
  it('rescheduling does not change grant terms or actual checkpoint dates', () => {
    let s = plan()
    const original = structuredClone(s.terms)
    s = change(s, {
      kind: 'save_followup',
      title: 'Review evidence',
      ownerId: 'reviewer',
      due: '2026-11-13',
      waitingOn: 'Applicant',
      note: 'Next action',
    })
    s = change(s, {
      kind: 'save_followup',
      followupId: s.followups[0].id,
      title: 'Review evidence',
      ownerId: 'reviewer',
      due: '2026-12-01',
      waitingOn: 'Applicant',
      note: 'Rescheduled by agreement',
    })
    s = change(s, { kind: 'draft_reminder', followupId: s.followups[0].id, body: 'Please add the evidence.' })
    expect(s.terms).toEqual(original)
    expect(s.followups[0].reminderDraft).toBe('Please add the evidence.')
    expect(s.followups[0].state).toBe('open')
  })
})
describe('applicant projection', () => {
  it('removes internal scoring, authorities, financial evidence, reviewers and follow-up drafts before serialization', () => {
    let s = change(accepted(), report())
    s = change(s, {
      kind: 'save_followup',
      title: 'Internal action',
      ownerId: 'reviewer',
      due: '2026-11-13',
      waitingOn: 'Staff',
      note: 'Private internal note',
    })
    const value = applicantProjection(s),
      serialized = JSON.stringify(value)
    expect(value.payments[0]).toEqual(expect.objectContaining({ amountMinor: 200000, state: 'reported' }))
    for (const secret of [
      'approval-1',
      'budget-1',
      'payment-1',
      'Private internal note',
      'External finance report',
      'Independent verifier-id',
    ])
      expect(serialized).not.toContain(secret)
    expect(value).not.toHaveProperty('assessment')
    expect(value).not.toHaveProperty('followups')
  })
})

describe('applicant-facing grant status', () => {
  const submitted = () => change(initialState(fields()), { kind: 'submit_application', confirm: true })

  it('reads old aggregates as submitted and publishes only explicit funding signals', () => {
    const current = submitted()
    const legacy = stateSchema.parse({ ...current, version: 1, statusReleases: undefined })
    expect(legacy.version).toBe(2)
    expect(applicationStatus(legacy)).toEqual({ status: 'submitted', updateRequested: false })
    expect(applicationStatus(reviewed()).status).toBe('submitted')
    const released = change(legacy, { kind: 'release_review_status', status: 'shortlisted' })
    const applicant = applicantProjection(released)
    expect(applicant.applicantStatus.status).toBe('shortlisted')
    expect(applicant.statusReleases).toEqual([{ id: released.statusReleases[0].id, at: now, status: 'shortlisted' }])
    expect(released.decisions).toHaveLength(0)
    expect(totals(released).approved).toBe(0)
  })

  it('shows a request beside shortlist and retains shortlist after a response', () => {
    const shortlist = change(submitted(), { kind: 'release_review_status', status: 'shortlisted' })
    const pending = change(shortlist, { kind: 'request_evidence', title: 'Pilot', body: 'Share pilot results', due: '2026-11-20' })
    expect(applicationStatus(pending)).toEqual({ status: 'shortlisted', updateRequested: true })
    expect(applicantProjection(pending).requests[0].due).toBe('2026-11-20')
    const answered = change(pending, { kind: 'answer_request', requestId: pending.requests[0].id, reply: 'Updated results' })
    expect(applicationStatus(answered)).toEqual({ status: 'shortlisted', updateRequested: false })
  })

  it('requires a new recommendation after a new application revision and retains release history', () => {
    const pending = change(submitted(), { kind: 'release_review_status', status: 'approval_pending' })
    const requested = change(pending, { kind: 'request_evidence', title: 'Pilot', body: 'Share pilot results' })
    const answered = change(requested, { kind: 'answer_request', requestId: requested.requests[0].id, reply: 'Updated results' })
    expect(applicationStatus(answered).status).toBe('in_review')
    expect(applicantProjection(answered).statusReleases[0].status).toBe('approval_pending')
    expect(applicationStatus(change(answered, { kind: 'release_review_status', status: 'approval_pending' })).status).toBe('approval_pending')
  })

  it('reopens a deferred application for reassessment without erasing its history', () => {
    const recommended = change(reviewed(), { kind: 'release_review_status', status: 'approval_pending' })
    const decision = {
      kind: 'record_decision' as const,
      outcome: 'deferred' as const,
      terms: null,
      rationale: 'Wait for more evidence',
      publicNote: 'Deferred pending the new guide.',
      ownerId: 'reviewer',
      budget: '',
      authority: 'test-authority',
    }
    const deferred = change(recommended, decision)
    expect(applicationStatus(deferred).status).toBe('deferred')
    const reopened = change(deferred, { kind: 'reopen_application', confirm: true })
    expect(applicationStatus(reopened).status).toBe('in_review')
    expect(reopened.assessmentVersionId).toBeNull()
    expect(reopened.applications).toEqual(recommended.applications)
    expect(applicantProjection(reopened).decisions[0]).toMatchObject({ outcome: 'deferred', publicNote: decision.publicNote })
    expect(() => change(reopened, { kind: 'reopen_application', confirm: true })).toThrow()
    expect(() => change(approved(), { kind: 'reopen_application', confirm: true })).toThrow()
    const final = change(reopened, { ...decision, outcome: 'not_selected' })
    expect(final.decisions.map((d) => d.outcome)).toEqual(['deferred', 'not_selected'])
  })

  it('withdraws a pending application, retaining history and preventing releases or replies', () => {
    const pending = change(submitted(), { kind: 'release_review_status', status: 'shortlisted' })
    const requested = change(pending, { kind: 'request_evidence', title: 'Pilot', body: 'Share pilot results' })
    const withdrawn = change(requested, { kind: 'withdraw_application', confirm: true })
    expect(applicationStatus(withdrawn)).toEqual({ status: 'withdrawn', updateRequested: false })
    expect(withdrawn.statusReleases).toHaveLength(1)
    expect(() => change(withdrawn, { kind: 'release_review_status', status: 'approval_pending' })).toThrow()
    expect(() => change(withdrawn, { kind: 'answer_request', requestId: requested.requests[0].id, reply: 'Updated results' })).toThrow()
    expect(() => change(approved(), { kind: 'withdraw_application', confirm: true })).toThrow()
  })
})

describe('milestone-first short submissions', () => {
  const short = {
    intakeVersion: 2 as const, amountMinor: 500000, summary: 'A reproducible dashboard',
    milestone: { source: 'application' as const, title: 'Publish the dashboard', due: '2026-12-01', evidence: 'A reproducible demo' },
  }
  const submit = (milestoneFirst: boolean) => transition(initialState(short), {
    kind: 'submit_application', confirm: true, shortAnswers: short,
  }, { id: 'initial-revision', actorId: 'builder', now, projectVersionId: 'project-version-1', milestoneFirst })
  const evidence: Command = { kind: 'submit_delivery', release: 'https://example.test/release', reproduction: 'https://example.test/test', note: 'Synthetic evidence' }
  const clearance = commandSchema.safeParse({ kind: 'clear_milestone', confirm: true })
  const award: Command = {
    kind: 'record_decision', outcome: 'approved', terms: {
      ...fields().terms, title: short.milestone.title, acceptance: short.milestone.evidence, due: short.milestone.due,
    }, rationale: 'Verified output', publicNote: 'Award issued for the dashboard', ownerId: 'reviewer', budget: 'budget-1', authority: 'approval-1',
  }
  const payment: Command = { kind: 'report_payment', reference: 'synthetic-reference', amountMinor: 500000, date: now.slice(0,10), evidence: 'https://example.test/payment', note: 'Synthetic only' }

  it('versions only flagged short submissions and separates clearance, verified evidence and award', () => {
    expect(initialState(short).version).toBe(2)
    expect(submit(false).version).toBe(2)
    expect(transition(initialState(fields()), { kind: 'submit_application', confirm: true }, {
      id: 'legacy', actorId: 'builder', now, projectVersionId: 'project-version-1', milestoneFirst: true,
    }).version).toBe(2)
    let state = submit(true)
    expect(state.version).toBe(3)
    expect(() => change(state, evidence)).toThrow(/clear/i)
    expect(() => change(state, award)).toThrow(/verify/i)
    expect(clearance.success).toBe(true)
    if (!clearance.success) throw clearance.error
    expect(mayCommand({ isSuperAdmin: false, permissions: new Set<Permission>(['grants.review']) }, clearance.data.kind, null)).toBe(false)
    const requested = change(state, { kind: 'request_evidence', title: 'Test request', body: 'Clarify the test plan' })
    expect(() => change(requested, clearance.data)).toThrow(/open evidence requests/i)
    state = change(state, clearance.data)
    expect(state.terms).toHaveLength(0)
    expect(totals(state).approved).toBe(0)
    expect(() => change(state, clearance.data)).toThrow(/already/i)
    state = change(state, evidence)
    const review = (outcome: 'accepted' | 'changes_requested'): Command => ({
      kind: 'review_delivery', deliveryId: state.deliveries.at(-1)!.id, outcome, inspected: true,
      reproduced: true, matches: true, note: 'Review result', evidence: 'Review evidence',
    })
    state = change(state, review('changes_requested'))
    state = change(state, evidence)
    const clarification = { kind: 'request_evidence', title: 'Confirm rights', body: 'Who approved publishing the same milestone?' } as const
    state = change(state, clarification) // Pending proof does not prevent a same-scope question.
    state = change(state, review('accepted'))
    const pendingReply = { kind: 'answer_request', requestId: state.requests.at(-1)!.id, reply: 'The project approved publishing it.' } as const
    const proof = state.deliveries
    const snapshots = state.applications
    const binding = state.version === 3 ? state.milestoneClearance : null
    expect(() => change(state, award)).toThrow(/open evidence/i)
    state = change(state, pendingReply)
    expect(state.status).toBe('submitted')
    expect(() => change(state, payment)).toThrow(/award/i)
    state.assessment = reviewed().assessment
    state.assessment.clearances.rights = { state: 'unresolved', evidence: '' }
    state = change(state, { kind: 'save_assessment', assessment: state.assessment })
    expect(() => change(state, award)).toThrow(/rights/i)
    state = change(state, clarification) // Verified proof does not prevent a required clarification.
    const lateReply = { ...pendingReply, requestId: state.requests.at(-1)!.id }
    expect(() => change(state, award)).toThrow(/open evidence/i)
    if (state.version !== 3 || !state.milestoneClearance) throw new Error('Expected a cleared milestone')
    const stale = { ...state, milestoneClearance: { ...state.milestoneClearance, applicationRevisionId: 'different-revision' } }
    expect(() => change(stale, clarification)).toThrow(/pinned/i)
    expect(() => change(stale, lateReply)).toThrow(/pinned/i)
    const changedScope = structuredClone(state)
    changedScope.answers.milestone!.title = 'Do different work instead'
    expect(() => change(changedScope, lateReply)).toThrow(/pinned/i)
    expect(() => change(changedScope, award)).toThrow(/pinned/i)
    state = change(state, lateReply)
    expect(state.deliveries).toEqual(proof)
    expect(state.applications).toEqual(snapshots)
    expect(state.version === 3 && state.milestoneClearance).toEqual(binding)
    expect(() => change(state, lateReply)).toThrow(/not open/i)
    expect(() => change(state, award)).toThrow(/assessment/i)
    state.assessment = reviewed().assessment
    state = change(state, { kind: 'save_assessment', assessment: state.assessment })
    expect(() => change(state, { ...award, terms: { ...award.terms!, title: 'Different work' } })).toThrow(/pinned/i)
    expect(() => change(state, { ...award, budget: '' })).toThrow(/budget/i)
    state = change(state, award)
    expect(state.status).toBe('approved')
    expect(state.terms[0].confirmedAt).toBeNull()
    expect(() => change(state, { kind: 'confirm_terms', confirm: true })).toThrow(/confirmation/i)
    expect(() => change(state, award)).toThrow()
    state = change(state, payment)
    expect(() => change(state, payment)).toThrow()
    expect(applicantProjection(state)).not.toHaveProperty('milestoneClearance')
    expect(JSON.stringify(applicantProjection(state))).not.toMatch(/synthetic-reference|budget-1/)
  })

  it('expires the recommendation after a cleared-milestone reply and requires a new assessment and release in event order', () => {
    if (!clearance.success) throw clearance.error
    let state = change(submit(true), clearance.data)
    state = change(state, evidence)
    state = change(state, { kind: 'review_delivery', deliveryId: state.deliveries[0].id, outcome: 'accepted',
      inspected: true, reproduced: true, matches: true, note: 'Same evidence', evidence: 'Private record' })
    const assessment = reviewed().assessment
    const recommend = { kind: 'release_review_status', status: 'approval_pending' } as const
    const request = { kind: 'request_evidence', title: 'Clarify publishing rights', body: 'For the same pinned scope' } as const
    const answer = (item: GrantState, index: number) =>
      change(item, { kind: 'answer_request', requestId: item.requests[index].id, reply: 'Confirmed rights' })
    state = change(change(state, { kind: 'save_assessment', assessment }), recommend)
    const first = state.statusReleases[0]
    const proof = state.deliveries
    const snapshots = state.applications
    const binding = state.version === 3 && state.milestoneClearance
    state = change(change(state, request), request)
    expect(applicationStatus(state)).toEqual({ status: 'approval_pending', updateRequested: true })
    state = answer(state, 0)
    expect(applicationStatus(state)).toEqual({ status: 'in_review', updateRequested: true })
    expect(() => change(state, recommend)).toThrow(/open evidence/i)
    state = answer(state, 1)
    expect(applicationStatus(state)).toEqual({ status: 'in_review', updateRequested: false })
    expect(applicantProjection(state).statusReleases[0]).toMatchObject({ id: first.id, status: 'approval_pending' })
    expect(state.deliveries).toEqual(proof)
    expect(state.applications).toEqual(snapshots)
    expect(state.version === 3 && state.milestoneClearance).toEqual(binding)
    expect(() => change(state, recommend)).toThrow(/reassess/i)
    const premature = structuredClone(state)
    premature.statusReleases.push({ ...first, id: 'premature-release' })
    premature.events.push({ id: 'premature-release', actorId: 'reviewer', at: first.at, kind: 'release_review_status', note: 'Approval pending' })
    expect(applicationStatus(change(premature, { kind: 'save_assessment', assessment })).status).toBe('in_review')
    state = change(state, { kind: 'save_assessment', assessment })
    expect(applicationStatus(state).status).toBe('in_review')
    state = change(state, recommend)
    expect(state.statusReleases[1].at).toBe(first.at)
    expect(applicationStatus(state)).toEqual({ status: 'approval_pending', updateRequested: false })
    const shortlisted = change(state, { kind: 'release_review_status', status: 'shortlisted' })
    expect(applicationStatus(answer(change(shortlisted, request), 2)).status).toBe('shortlisted')
  })
})

it('US-1 recognizes a usable project demo URL without fetching it', () => {
  expect(hasDemoProof([])).toBe(false)
  expect(hasDemoProof(['', 'about:blank', 'https://', 'not a link'])).toBe(false)
  expect(hasDemoProof(['not a link', 'https://example.test/demo'])).toBe(true)
})
