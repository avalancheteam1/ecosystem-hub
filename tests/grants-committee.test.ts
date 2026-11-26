import { describe, expect, it } from 'vitest'
import { committeeVoteResult } from '@/app/(site)/grants/_lib/committee-policy'
import { ForbiddenError } from '@/lib/action-error'
import { applicantProjection, applicationStatus, initialState, mayCommand, planAwardScope, transition } from '@/app/(site)/grants/_lib/rules'
import { clearanceIds, commandSchema, criterionIds, stateSchema, type Command, type GrantState, type PlanIntake } from '@/app/(site)/grants/_lib/schemas'

const now = '2026-11-26T12:00:00.000Z'
const projectVersionId = 'project-version'
const roster = { shortlisterId: 'shortlister', memberIds: ['seat-a', 'seat-b', 'seat-c', 'seat-d'] }
const context = { now, projectVersionId, committeeReviewEnabled: true, committeeRoster: roster }
const answers: PlanIntake = {
  intakeVersion: 3,
  amountMinor: 50000,
  summary: 'Improve reproducible deployment',
  milestones: [
    { source: 'application', title: 'Quickstart', due: '2026-12-01', evidence: 'Reproduce from scratch' },
    { source: 'application', title: 'Example', due: '2026-12-02', evidence: 'Run independently' },
  ],
}
let event = 0
const apply = (state: GrantState, command: Command, actorId = roster.shortlisterId,
  overrides: Partial<Parameters<typeof transition>[2]> = {}) =>
  transition(state, command, { ...context, id: `event-${++event}`, actorId, ...overrides })

function fixture() {
  const state = apply(initialState(answers), { kind: 'submit_application', confirm: true, planAnswers: answers }, 'builder')
  if (state.version !== 4) throw new Error('Expected a multi-milestone plan')
  const plan = state.applications[0]
  const [first, second] = plan.answers.milestones
  const shortlist = { kind: 'shortlist_application', planId: plan.id } as const
  const clear = { kind: 'clear_milestone', confirm: true, planId: plan.id } as const
  const propose = {
    kind: 'request_award_amount', planId: plan.id, totalMinor: 45000, reason: 'Budget for the quickstart',
    milestoneAmounts: [{ milestoneId: first.milestoneId, amountMinor: 45000 }, { milestoneId: second.milestoneId, amountMinor: 0 }],
  } as const
  return { state, plan, shortlist, clear, propose: { ...propose, milestoneAmounts: [...propose.milestoneAmounts] } }
}

const issue = { kind: 'issue_award', rationale: 'Verified', publicNote: 'Award issued' } as const
const respond = (requestId: string, outcome: 'accepted' | 'declined' = 'accepted') =>
  ({ kind: 'respond_award_amount', requestId, outcome } as const)
const vote = (requestId: string, value: 'approve' | 'oppose' = 'approve') =>
  ({ kind: 'vote_award', requestId, vote: value, note: 'Private ballot text' } as const)
function latest(state: GrantState) {
  if (state.version !== 4) throw new Error('Expected Committee workflow')
  const request = state.committeeReview?.requests.at(-1)
  if (!request) throw new Error('Expected amount request')
  return request
}

describe('Mini Grants Committee', () => {
  it('requires the shortlister and the pinned plan without releasing an applicant status', () => {
    const { state, shortlist, clear, propose } = fixture()
    const hold = { kind: 'hold_application', rationale: 'Review', publicNote: 'Held', nextStep: 'Wait' } as const
    const decline = { kind: 'decline_application', rationale: 'Review', publicNote: 'Declined' } as const
    expect(() => apply(state, shortlist, 'seat-a')).toThrow(ForbiddenError)
    expect(() => apply(state, { ...shortlist, planId: 'stale-plan' })).toThrow(/pinned plan/i)
    expect(() => apply(state, shortlist, roster.shortlisterId, { committeeReviewEnabled: false })).toThrow(/unavailable/i)
    for (const command of [clear, hold, decline, propose]) expect(() => apply(state, command, 'seat-a')).toThrow(/shortlist/i)
    const release = { kind: 'release_review_status', status: 'shortlisted' } as const
    expect(() => apply(state, release, 'seat-a')).toThrow(/shortlist/i)
    const shortlisted = apply(state, shortlist)
    expect(shortlisted).toMatchObject({ committeeReview: { shortlist: { actorId: roster.shortlisterId, reviewerIds: roster.memberIds }, requests: [] } })
    expect(applicationStatus(shortlisted).status).toBe('submitted')
    expect(applicationStatus(apply(shortlisted, release, 'seat-a')).status).toBe('shortlisted')
    expect(() => apply(shortlisted, shortlist)).toThrow(/already shortlisted/i)
    for (const command of [clear, hold, decline]) expect(() => apply(shortlisted, command)).toThrow(ForbiddenError)
    expect(apply(shortlisted, hold, 'seat-a').status).toBe('deferred')
    expect(apply(shortlisted, decline, 'seat-a').status).toBe('not_selected')
    expect(apply(shortlisted, clear, 'seat-a', { committeeReviewEnabled: false })).toMatchObject({ planApproval: { planId: shortlist.planId } })
    expect(mayCommand({ isSuperAdmin: false, permissions: new Set() }, 'respond_award_amount', 'reader')).toBe(false)
    expect(mayCommand({ isSuperAdmin: false, permissions: new Set() }, 'respond_award_amount', 'writer')).toBe(true)
  })

  it('pins every amount, requires the exact current response, and projects an allowlist', () => {
    const { state, shortlist, propose } = fixture()
    const shortlisted = apply(state, shortlist)
    const [first, second] = propose.milestoneAmounts
    for (const patch of [
      { totalMinor: 50001 },
      { totalMinor: 44999 },
      { milestoneAmounts: [first, first] },
      { milestoneAmounts: [first] },
      { milestoneAmounts: [first, { ...second, milestoneId: 'stale-milestone' }] },
    ]) expect(() => apply(shortlisted, { ...propose, ...patch })).toThrow(/amount|milestone|allocation/i)
    expect(commandSchema.safeParse({ ...propose, totalMinor: 0 }).success).toBe(false)
    expect(commandSchema.safeParse({ ...propose, milestoneAmounts: [{ ...first, amountMinor: 1.1 }, second] }).success).toBe(false)
    expect(() => apply(shortlisted, propose, 'other-reviewer')).toThrow(ForbiddenError)
    const requested = apply(shortlisted, propose, 'seat-a')
    const firstId = latest(requested).id
    const declined = apply(requested, respond(firstId, 'declined'), 'builder')
    const revised = apply(declined, { ...propose, reason: 'Updated allocation' })
    const secondId = latest(revised).id
    expect(() => apply(revised, respond(firstId), 'builder')).toThrow(/current|latest/i)
    const accepted = apply(revised, { ...respond(secondId), note: 'Agreed to this split' }, 'builder', { committeeRoster: null })
    expect(() => apply(accepted, respond(secondId), 'builder')).toThrow(/already|pending/i)
    expect(applicantProjection(accepted).awardAmountRequest).toEqual({
      id: secondId, planId: propose.planId, totalMinor: propose.totalMinor, milestoneAmounts: propose.milestoneAmounts,
      reason: 'Updated allocation', response: { outcome: 'accepted', at: now, note: 'Agreed to this split' },
    })
    expect(accepted).toMatchObject({ committeeReview: { requests: [{ response: { outcome: 'declined' } }, { response: { outcome: 'accepted' } }] } })
    expect(stateSchema.parse(accepted)).toEqual(accepted)
  })

  it.each([1, 3, 4, 6])('requires all %i pinned votes, Finance and verified evidence', (size) => {
    const committeeRoster = { ...roster, memberIds: Array.from({ length: size }, (_, index) => `voter-${index + 1}`) }
    const firstVoter = committeeRoster.memberIds[0]
    const lastVoter = committeeRoster.memberIds.at(-1)!
    const applyCase: typeof apply = (state, command, actorId, overrides) =>
      apply(state, command, actorId, { committeeRoster, ...overrides })
    const { state, plan, shortlist, clear, propose } = fixture()
    let current = applyCase(applyCase(applyCase(state, shortlist), clear, firstVoter), propose)
    const requestId = latest(current).id
    current = applyCase(current, respond(requestId), 'builder')
    expect(() => applyCase(current, vote(requestId), firstVoter)).toThrow(/verify/i)
    for (const { milestoneId } of plan.answers.milestones) {
      current = applyCase(current, {
        kind: 'submit_delivery', planId: plan.id, milestoneId, previousAttemptId: null,
        release: 'https://example.test/release', reproduction: 'https://example.test/repro', note: 'Evidence',
      }, 'builder')
      current = applyCase(current, {
        kind: 'review_delivery', planId: plan.id, milestoneId, deliveryId: current.deliveries.at(-1)!.id,
        outcome: 'accepted', inspected: true, reproduced: true, matches: true, note: 'Verified', evidence: 'Reproduced',
      }, 'verifier')
    }
    const assessment = structuredClone(current.assessment)
    for (const id of criterionIds) assessment.criteria[id] = { score: '2', basis: 'E', source: 'Fixture', rationale: 'Fixture' }
    for (const id of clearanceIds) assessment.clearances[id] = { state: 'pass', evidence: 'Fixture' }
    current = applyCase(current, { kind: 'save_assessment', assessment }, firstVoter)
    const terms = {
      ...planAwardScope(plan.answers.milestones)!,
      amountMinor: propose.totalMinor, maintainer: 'Maintainer', verifier: 'Verifier',
      route: 'bounded_pilot' as const, hypothesis: 'Test hypotheses', limits: 'One pilot',
    }
    const awardAuthorization = { terms, budget: 'Finance fixture', authority: 'Authority fixture', awardRequestId: requestId }
    expect(() => applyCase(current, vote(requestId), 'shortlister')).toThrow(ForbiddenError)
    const open = applyCase(current, { kind: 'request_evidence', title: 'Clarify', body: 'What did you test?' }, firstVoter)
    expect(() => applyCase(open, vote(requestId), firstVoter)).toThrow(/open evidence/i)
    for (const seat of committeeRoster.memberIds.slice(0, -1)) current = applyCase(current, vote(requestId), seat)
    if (size > 1) expect(() => applyCase(current, vote(requestId), firstVoter)).toThrow(/already recorded/i)
    expect(() => applyCase(current, issue, firstVoter, { awardAuthorization })).toThrow(/every Committee member/i)
    current = applyCase(current, vote(requestId), lastVoter)
    current = applyCase(current, vote(requestId, 'oppose'), lastVoter)
    expect(() => applyCase(current, issue, firstVoter, { awardAuthorization })).toThrow(/every Committee member/i)
    current = applyCase(current, vote(requestId), lastVoter)
    const revised = applyCase(current, { ...propose, reason: 'New version' })
    expect(() => applyCase(revised, vote(requestId), firstVoter)).toThrow(/current|latest/i)
    const latestAccepted = applyCase(revised, respond(latest(revised).id), 'builder')
    expect(() => applyCase(latestAccepted, issue, firstVoter, { awardAuthorization })).toThrow(/every Committee member/i)
    const revoted = committeeRoster.memberIds.reduce((reviewed, actorId) => applyCase(reviewed, vote(latest(revised).id), actorId), latestAccepted)
    expect(() => applyCase(revoted, issue, firstVoter, { awardAuthorization })).toThrow(/accepted amount request/i)
    expect(() => applyCase(current, issue, firstVoter, { committeeRoster: { ...committeeRoster, memberIds: committeeRoster.memberIds.map((id) => id === lastVoter ? 'new-voter' : id) }, awardAuthorization })).toThrow(/roster/i)
    expect(() => applyCase(current, issue, firstVoter, { committeeReviewEnabled: false })).toThrow(/Finance/i)
    expect(() => applyCase(current, issue, firstVoter, { awardAuthorization: { ...awardAuthorization, awardRequestId: undefined } })).toThrow(/accepted amount request/i)
    expect(() => applyCase(current, issue, firstVoter, { awardAuthorization: { ...awardAuthorization, terms: { ...terms, amountMinor: terms.amountMinor - 1 } } })).toThrow(/accepted amount/i)
    const issued = applyCase(current, issue, firstVoter, { awardAuthorization, committeeReviewEnabled: false })
    expect(issued).toMatchObject({ status: 'approved', committeeReview: { issuedRequestId: requestId } })
    expect(applicantProjection(issued).awardAmountRequest).toMatchObject({ id: requestId, totalMinor: terms.amountMinor })
    expect(JSON.stringify(applicantProjection(issued))).not.toMatch(/Private ballot text|Finance fixture|voter-1|shortlister/)
    expect(() => applyCase(issued, propose)).toThrow(/awaiting|issued|submitted/i)
  })

  it('pins the assigned approval rule through a manual policy change', () => {
    const { state, shortlist, propose } = fixture()
    const committeeRoster = { ...roster, managed: true as const, approvalRule: 'simple_majority' as const }
    const shortlisted = stateSchema.parse(apply(state, shortlist, roster.shortlisterId, { committeeRoster }))
    const proposal = apply(shortlisted, propose, roster.shortlisterId, {
      committeeRoster: { ...committeeRoster, approvalRule: 'unanimity' },
    })
    expect(proposal).toMatchObject({ committeeReview: { shortlist: { approvalRule: 'simple_majority' } } })
    expect(apply(state, shortlist)).not.toHaveProperty('committeeReview.shortlist.approvalRule')
  })

  it('absolute majority counts all assigned seats and can pass before everyone votes', () => {
    const shortlist = { reviewerIds: ['a', 'b', 'c', 'd', 'e'], approvalRule: 'absolute_majority' as const }
    const votes = [{ actorId: 'a', vote: 'approve' }, { actorId: 'b', vote: 'approve' }] as const
    expect(committeeVoteResult(shortlist, { votes }).passed).toBe(false)
    expect(committeeVoteResult(shortlist, { votes: [...votes, { actorId: 'outside', vote: 'approve' }] }).passed).toBe(false)
    expect(committeeVoteResult(shortlist, { votes: [...votes, { actorId: 'c', vote: 'approve' }] }))
      .toMatchObject({ passed: true, majority: 3, outstanding: 2 })
  })

  it('simple majority waits for all ballots and abstentions, and ties do not pass', () => {
    const shortlist = { reviewerIds: ['a', 'b', 'c', 'd'], approvalRule: 'simple_majority' as const }
    const votes = [{ actorId: 'a', vote: 'approve' }, { actorId: 'b', vote: 'abstain' }, { actorId: 'c', vote: 'abstain' }] as const
    expect(committeeVoteResult(shortlist, { votes })).toMatchObject({ passed: false, outstanding: 1 })
    expect(committeeVoteResult(shortlist, { votes: [...votes, { actorId: 'd', vote: 'oppose' }] }))
      .toMatchObject({ passed: false, opposed: 1, approved: 1 })
    expect(committeeVoteResult(shortlist, { votes: [...votes, { actorId: 'd', vote: 'abstain' }] }))
      .toMatchObject({ passed: true, abstained: 3, outstanding: 0 })
    expect(committeeVoteResult(shortlist, {
      votes: [...votes, { actorId: 'd', vote: 'abstain' }, { actorId: 'a', vote: 'abstain' }],
    })).toMatchObject({ passed: false, approved: 0, opposed: 0, abstained: 4 })
  })

  it('US-3 keeps the roster source on a shortlisted case after flag changes', () => {
    const { state, shortlist, clear } = fixture()
    expect(() => apply(state, shortlist, roster.shortlisterId, { committeeRoster: null })).toThrow(/roster/i)
    const managed = { ...roster, managed: true as const }
    const shortlisted = apply(state, shortlist, roster.shortlisterId, { committeeRoster: managed })
    const stored = stateSchema.parse(shortlisted)
    expect(stored).toMatchObject({ committeeReview: { shortlist: { managedRoster: true, reviewerIds: roster.memberIds } } })
    expect(() => apply(stored, clear, 'seat-a', { committeeReviewEnabled: false })).toThrow(/roster changed/i)
    expect(apply(stored, clear, 'seat-a', { committeeReviewEnabled: false, committeeRoster: managed }))
      .toMatchObject({ planApproval: { planId: shortlist.planId } })
    const legacy = apply(state, shortlist)
    expect(() => apply(legacy, clear, 'seat-a', { committeeRoster: managed })).toThrow(/roster changed/i)
  })

  it('preserves decision behavior for v4 cases without a shortlist while the feature is off', () => {
    const { state, clear } = fixture()
    const legacy = apply(state, clear, 'original-reviewer', { committeeReviewEnabled: false, committeeRoster: null })
    expect(legacy).toMatchObject({ planApproval: { planId: clear.planId } })
    expect(legacy).not.toHaveProperty('committeeReview')
    expect(applicantProjection(legacy)).not.toHaveProperty('awardAmountRequest')
  })
})
