import { canEditProject } from '@/lib/project-submission'
import { committeeVoteResult, validCommitteeSize, type CommitteeApprovalRule } from './committee-policy'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import type { Permission } from '@/lib/permissions'
import { can, type AuthzUser } from '@/lib/permissions'
import { stateSchema, answers, shortSubmission, planSubmission, publicAwardTerms, committeePublicAwardTerms, terms, type IntakeAnswers, type ShortIntake, criterionIds, clearanceIds, type Answers, type Assessment, type Command, type GrantState } from './schemas'

export const criterionNames = [
  'Avalanche relevance',
  'Problem and beneficiaries',
  'Execution capability',
  'Incremental outcome',
  'Verifiable milestones',
  'Budget vs Avalanche benefit',
  'Continuity and measurement',
  'Risks and dependencies',
  'Realized Avalanche impact',
]
export const clearanceNames = [
  'Eligibility and round',
  'Rights and consent',
  'Conflicts of interest',
  'Exposure-specific security',
  'Funding overlap and runway',
  'Maintenance and measurement',
]
export const weight = (id: string) => (id === 'c9' ? 20 : 10)
export function score(a: Assessment) {
  let total = 0,
    lower = 0,
    upper = 0,
    coverage = 0,
    missing = false
  for (const id of criterionIds) {
    const r = a.criteria[id],
      w = weight(id)
    if (r.score === 'ND') {
      missing = true
      upper += 3 * w
      continue
    }
    total += Number(r.score) * w
    if (r.basis === 'E') {
      lower += Number(r.score) * w
      upper += Number(r.score) * w
      coverage += w
    } else upper += 3 * w
  }
  return { total: missing ? null : total / 100, lower: lower / 100, upper: upper / 100, coverage }
}
export function readiness(s: GrantState, route?: string) {
  const reasons: string[] = []
  if (!s.assessmentVersionId || s.assessmentVersionId !== s.applications.at(-1)?.projectVersionId)
    reasons.push('Review the assessment against the current submitted project version')
  for (const id of criterionIds) {
    const r = s.assessment.criteria[id]
    if (r.score !== 'ND' && (!r.source.trim() || !r.rationale.trim())) reasons.push(`${id}: source and rationale required`)
    if (['c1', 'c3', 'c4', 'c5', 'c6', 'c8'].includes(id) && (r.score === 'ND' || Number(r.score) < 2 || r.basis !== 'E'))
      reasons.push(`${id}: at least 2E required`)
    if (id !== 'c9' && r.score === '0') reasons.push(`${id}: zero score`)
  }
  for (const id of clearanceIds)
    if (s.assessment.clearances[id].state === 'unresolved' || !s.assessment.clearances[id].evidence.trim())
      reasons.push(`${id}: unresolved readiness`)
  const c9 = s.assessment.criteria.c9
  if (route === 'established_impact' && (c9.score === 'ND' || Number(c9.score) < 2 || c9.basis !== 'E'))
    reasons.push('Established impact requires c9 at least 2E')
  return reasons
}
export function initialState(answers: Answers): GrantState & { answers: Answers }
export function initialState(answers: IntakeAnswers): GrantState
export function initialState(answers: IntakeAnswers): GrantState {
  return stateSchema.parse({
    ...(answers.intakeVersion === 3 ? { version: 4, planApproval: null } : { version: 2 }),
    statusReleases: [],
    status: 'draft',
    answers,
    assessment: {
      criteria: Object.fromEntries(criterionIds.map((id) => [id, { score: 'ND', basis: 'S', source: '', rationale: '' }])),
      clearances: Object.fromEntries(clearanceIds.map((id) => [id, { state: 'unresolved', evidence: '' }])),
      note: '',
    },
    applications: [],
    requests: [],
    decisions: [],
    terms: [],
    deliveries: [],
    payments: [],
    amendments: [],
    followups: [],
    impactPlan: null,
    impact: [],
    closedAt: null,
    events: [],
  })
}
export function issuedPayoutAward(state: GrantState, projectVersionId: string) {
  if (state.version !== 4 || state.status !== 'approved' || state.applications[0]?.projectVersionId !== projectVersionId) return null
  const award = state.decisions.at(-1)
  return award?.outcome === 'approved' && award.terms && state.terms[0]?.id === award.id ? award : null
}

export function payoutConfirmationClosed(state: GrantState) {
  return !!state.closedAt || state.payments.length > 0
}

export const activeTerms = (s: GrantState) => s.version === 3 || s.version === 4
  ? (s.status === 'approved' ? s.terms.at(-1) : undefined)
  : s.terms.findLast((t) => t.confirmedAt !== null)
export const pendingAmendment = (s: GrantState) =>
  s.amendments.findLast((a) => ['submitted', 'changes_requested', 'approved'].includes(a.state))
export function totals(s: GrantState) {
  const approved = activeTerms(s)?.terms.amountMinor ?? s.decisions.findLast((d) => d.outcome === 'approved')?.terms?.amountMinor ?? 0
  const paid = s.payments.filter((p) => p.state === 'confirmed').reduce((n, p) => n + p.amountMinor, 0)
  const reserved = s.payments.filter((p) => ['reported', 'uncertain', 'disputed'].includes(p.state)).reduce((n, p) => n + p.amountMinor, 0)
  return { approved, paid, reserved, remaining: approved - paid }
}
const applicantCommands: Command['kind'][] = [
  'withdraw_application',
  'save_application',
  'submit_application',
  'answer_request',
  'respond_award_amount',
  'confirm_terms',
  'submit_delivery',
  'submit_amendment',
  'respond_amendment',
  'save_impact',
]
export function commandPermission(kind: Command['kind']): Permission | 'applicant' {
  if (applicantCommands.includes(kind)) return 'applicant'
  if (['clear_milestone', 'record_decision', 'hold_application', 'decline_application', 'issue_award',
    'review_amendment', 'release_review_status', 'reopen_application'].includes(kind)) return 'grants.decide'
  if (kind === 'review_delivery') return 'grants.verify'
  if (['report_payment', 'reconcile_payment'].includes(kind)) return 'grants.payments'
  return 'grants.review'
}
export function mayCommand(user: AuthzUser, kind: Command['kind'], memberRole: string | null) {
  const p = commandPermission(kind)
  return p === 'applicant' ? canEditProject(memberRole ?? '') : can(user, p) && can(user, 'grants.review')
}
const need = (condition: unknown, message: string) => {
  if (!condition) throw new ActionError(message)
}
function requirePinnedClearance(
  s: Extract<GrantState, { version: 3 }>,
  projectVersionId: string,
  missing: string,
) {
  const clearance = s.milestoneClearance
  if (!clearance) throw new ActionError(missing)
  const submitted = s.applications.at(-1)
  const pinned = submitted?.answers.intakeVersion === 2 ? submitted.answers.milestone : null
  const milestone = s.answers.milestone
  need(
    clearance.applicationRevisionId === submitted?.id && clearance.projectVersionId === projectVersionId &&
    submitted?.projectVersionId === projectVersionId && pinned && milestone && pinned.source === milestone.source &&
    (pinned.source !== 'roadmap' || milestone.source === 'roadmap' && pinned.id === milestone.id) &&
    pinned.title === milestone.title && pinned.due === milestone.due && pinned.evidence === milestone.evidence,
    'This case no longer matches the cleared milestone. Pause here and ask the grant team to review the pinned submission before continuing.',
  )
}
export function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
// The grant transaction appends events in revision order, even when their timestamps tie.
function latestReplyRequiringAssessment(s: GrantState) {
  if (s.version === 4) return s.events.findLastIndex((event) => event.kind === 'answer_request')
  if (s.version !== 3 || !s.milestoneClearance) return -1
  const clearanceId = s.milestoneClearance.id
  const clearance = s.events.findIndex((event) => event.kind === 'clear_milestone' && event.id === clearanceId)
  const reply = s.events.findLastIndex((event) => event.kind === 'answer_request')
  return clearance !== -1 && reply > clearance ? reply : -1
}

function reassessedAfter(s: GrantState, reply: number, before = s.events.length) {
  return s.events.some((event, index) => index > reply && index < before && event.kind === 'save_assessment')
}

type MultiMilestoneState = Extract<GrantState, { version: 4 }>
type CommitteeRoster = { shortlisterId: string; memberIds: readonly string[]; managed?: true; approvalRule?: CommitteeApprovalRule }

function pinnedPlan(state: MultiMilestoneState, planId: string | undefined, projectVersionId: string) {
  const plan = state.applications.at(-1)
  if (!plan || plan.id !== planId || plan.projectVersionId !== projectVersionId)
    throw new ActionError('Review the current pinned plan before continuing.')
  return plan
}

function requireCommitteeRoster(roster: CommitteeRoster | null | undefined, review?: MultiMilestoneState['committeeReview']) {
  if (!roster?.shortlisterId || !validCommitteeSize(roster.memberIds.length) || new Set(roster.memberIds).size !== roster.memberIds.length ||
    roster.memberIds.some((memberId) => !memberId || memberId === roster.shortlisterId))
    throw new ActionError('The Committee roster is unavailable.')
  if (review && (review.shortlist.managedRoster !== roster.managed || review.shortlist.actorId !== roster.shortlisterId ||
    review.shortlist.reviewerIds.length !== roster.memberIds.length ||
    !review.shortlist.reviewerIds.every((memberId) => roster.memberIds.includes(memberId))))
    throw new ActionError('The configured Committee roster changed after shortlisting.')
  return roster
}

function shortlistedReview(state: MultiMilestoneState, planId: string | undefined, projectVersionId: string) {
  const plan = pinnedPlan(state, planId, projectVersionId)
  if (state.committeeReview?.shortlist.planId !== plan.id)
    throw new ActionError('Shortlist the pinned plan before continuing.')
  return { plan, review: state.committeeReview }
}

function requireCommitteeMember(
  state: MultiMilestoneState, planId: string | undefined, projectVersionId: string,
  actorId: string, roster: CommitteeRoster | null | undefined, allowShortlister = false,
) {
  const { plan, review } = shortlistedReview(state, planId, projectVersionId)
  const { memberIds, shortlisterId } = requireCommitteeRoster(roster, review)
  if (!memberIds.includes(actorId) && !(allowShortlister && actorId === shortlisterId))
    throw new ForbiddenError('You are not assigned to this Committee action')
  return { plan, review }
}

function approvedPlan(s: MultiMilestoneState, planId: string | undefined, projectVersionId: string) {
  const plan = s.applications.at(-1)
  if (!s.planApproval || !plan || planId !== plan.id || s.planApproval.planId !== plan.id ||
    s.planApproval.projectVersionId !== projectVersionId || plan.projectVersionId !== projectVersionId)
    throw new ActionError('Review the current approved milestone plan before continuing.')
  return plan
}

export function milestonePlan(s: GrantState) {
  if (s.version !== 4) return null
  const plan = s.applications.at(-1)
  if (!plan) return null
  const approvedAt = s.planApproval?.planId === plan.id && s.planApproval.projectVersionId === plan.projectVersionId
    ? s.planApproval.at : null
  const milestones = plan.answers.milestones.map((milestone) => {
    const latest = s.deliveries.findLast((d) => d.planId === plan.id && d.milestoneId === milestone.milestoneId)
    return { ...milestone, status: latest?.state ?? 'awaiting_evidence' as const, latestAttemptId: latest?.id ?? null }
  })
  return { id: plan.id, approvedAt, milestones }
}

export function planAwardScope(milestones: readonly { title: string; due: string; evidence: string }[]) {
  const [first] = milestones
  if (!first) return null
  return {
    title: milestones.length === 1 ? first.title : 'Milestone plan',
    due: milestones.reduce((due, milestone) => milestone.due > due ? milestone.due : due, first.due),
    acceptance: milestones.length === 1 ? first.evidence
      : milestones.map((milestone) => `${milestone.title}\n${milestone.evidence}`).join('\n\n'),
  }
}

function allMilestonesVerified(s: MultiMilestoneState) {
  const plan = milestonePlan(s)
  return !!plan?.approvedAt && plan.milestones.every((milestone) => milestone.status === 'accepted')
}

export function deliveryAcceptedAt(deliveries: readonly { state: string; review: { at: string } | null }[], multi: boolean) {
  if (!multi) return deliveries.findLast((d) => d.state === 'accepted')?.review?.at
  // Review order can differ from evidence submission order with multiple milestones.
  return deliveries.flatMap((d) => d.state === 'accepted' && d.review ? [d.review.at] : []).sort().at(-1)
}

export function transition(
  previous: GrantState,
  command: Command,
  context: {
    id: string; actorId: string; now: string; projectVersionId: string; milestoneFirst?: boolean
    committeeReviewEnabled?: boolean
    committeeRoster?: CommitteeRoster | null
    awardAuthorization?: { terms: GrantState['terms'][number]['terms']; budget: string; authority: string; awardRequestId?: string }
  },
) {
  const s = structuredClone(previous),
    c = command,
    { id, actorId, now, projectVersionId } = context
  const meta = { id, actorId, at: now },
    today = now.slice(0, 10)
  const committeeRequired = s.version === 4 && (context.committeeReviewEnabled || !!s.committeeReview)
  need(!s.closedAt || c.kind === 'reconcile_payment', 'This grant is closed')
  switch (c.kind) {
    case 'save_application':
      need(s.status === 'draft', 'Submitted applications are immutable; answer a request instead')
      if (s.version === 3) throw new ActionError('This application was already submitted')
      if (s.version === 4) {
        if (c.answers.intakeVersion !== 3) throw new ActionError('Continue using the milestone plan for this draft.')
        s.answers = c.answers
      } else {
        if (c.answers.intakeVersion === 3 || s.answers.intakeVersion !== c.answers.intakeVersion)
          throw new ActionError('Continue using the original form for this draft')
        s.answers = c.answers
      }
      break
    case 'submit_application':
      if (s.version === 3 || s.status !== 'draft') throw new ActionError('This application was already submitted')
      if (s.version === 4) {
        if (!c.planAnswers || c.shortAnswers) throw new ActionError('Review the milestone plan before submitting.')
        const result = planSubmission.safeParse(c.planAnswers)
        if (!result.success) throw new ActionError(result.error.issues[0]?.message || 'Complete the milestone plan.')
        need(result.data.milestones.every((milestone) => milestone.due >= today), 'Milestone target dates must be today or later.')
        s.answers = result.data
        const milestones = result.data.milestones.map((milestone, index) => ({ ...milestone, milestoneId: `${id}:${index + 1}` }))
        s.applications.push({ ...meta, answers: { ...result.data, milestones }, projectVersionId })
        s.status = 'submitted'
        break
      }
      {
        need(!c.planAnswers, 'Continue using the original form for this draft')
        if (s.answers.intakeVersion === 2) {
          if (!c.shortAnswers) throw new ActionError('Review the short application and include the reviewed answers before submitting.')
          s.answers = c.shortAnswers
        } else {
          need(!c.shortAnswers, 'Continue using the original form for this draft')
        }
        const submission = s.answers.intakeVersion === 2 ? shortSubmission.safeParse(s.answers) : answers.safeParse(s.answers)
        if (!submission.success) throw new ActionError(submission.error.issues[0]?.message || 'Complete the application')
        const due = s.answers.intakeVersion === 2 ? s.answers.milestone?.due ?? '' : s.answers.terms.due
        need(due >= today, 'Target delivery must be today or later')
      }
      s.applications.push({ ...meta, answers: structuredClone(s.answers), projectVersionId })
      s.status = 'submitted'
      break
    case 'save_assessment':
      need(s.status === 'submitted', 'Only submitted applications can be assessed')
      s.assessment = c.assessment
      s.assessmentVersionId = projectVersionId
      break
    case 'release_review_status': {
      need(s.status === 'submitted', 'Only applications awaiting a decision can receive a review status')
      const revision = s.applications.at(-1)
      need(revision, 'Submit the application before releasing a review status')
      if (c.status === 'shortlisted' && s.version === 4 && committeeRequired)
        shortlistedReview(s, revision?.id, projectVersionId)
      if (c.status === 'approval_pending') {
        const reply = latestReplyRequiringAssessment(s)
        if (reply !== -1) {
          need(!s.requests.some((request) => !request.answeredAt), 'Resolve open evidence requests before releasing a new recommendation')
          need(s.assessmentVersionId === revision!.projectVersionId && reassessedAfter(s, reply),
            'Reassess the pinned submission before releasing a new recommendation')
        }
      }
      need(applicationStatus(s).status !== c.status, 'This review status is already visible')
      s.statusReleases.push({ ...meta, status: c.status, applicationRevisionId: revision!.id })
      break
    }
    case 'reopen_application': {
      const revision = s.applications.at(-1)
      need(s.status === 'deferred' && s.decisions.at(-1)?.outcome === 'deferred' && revision, 'Only deferred applications can be reopened')
      s.status = 'submitted'
      s.assessmentVersionId = null
      s.statusReleases.push({ ...meta, status: 'in_review', applicationRevisionId: revision!.id })
      break
    }
    case 'withdraw_application':
      need(s.status === 'submitted', 'Only applications awaiting a decision can be withdrawn')
      s.status = 'withdrawn'
      break
    case 'request_evidence':
      need(s.status === 'submitted', 'This application is not under review')
      if (s.version === 3 && s.milestoneClearance)
        requirePinnedClearance(s, projectVersionId, 'Review the pinned milestone first')
      need(!c.due || c.due >= today, 'The evidence due date must be today or later')
      s.requests.push({ ...meta, title: c.title, body: c.body, due: c.due || undefined, reply: '', answeredAt: null })
      break
    case 'answer_request': {
      need(s.status === 'submitted', 'This application is no longer under review')
      const sameMilestone = s.version === 3 && s.milestoneClearance !== null
      if (sameMilestone) requirePinnedClearance(s, projectVersionId, 'Review the pinned milestone first')
      const r = s.requests.find((r) => r.id === c.requestId)
      need(r && !r.answeredAt, 'This request is not open')
      r!.reply = c.reply
      r!.answeredAt = now
      s.assessmentVersionId = null
      // A late reply is recorded on its request and in the grant revision. It is not a new scope snapshot.
      if (!sameMilestone && s.version !== 4) s.applications.push({ ...meta, answers: structuredClone(s.answers), projectVersionId })
      break
    }
    case 'shortlist_application': {
      if (s.version !== 4 || !committeeRequired) throw new ActionError('Committee shortlisting is unavailable.')
      need(s.status === 'submitted', 'Only a submitted application can be shortlisted.')
      const plan = pinnedPlan(s, c.planId, projectVersionId)
      const roster = requireCommitteeRoster(context.committeeRoster)
      if (actorId !== roster.shortlisterId) throw new ForbiddenError('Only the configured shortlister may shortlist a plan')
      need(!s.committeeReview, 'This plan is already shortlisted.')
      s.committeeReview = {
        shortlist: {
          actorId, at: now, planId: plan.id, reviewerIds: [...roster.memberIds],
          ...(roster.managed ? { managedRoster: true } : {}),
          ...(roster.approvalRule ? { approvalRule: roster.approvalRule } : {}),
        },
        requests: [],
      }
      break
    }
    case 'request_award_amount': {
      if (s.version !== 4 || !committeeRequired) throw new ActionError('Award amount requests are unavailable.')
      need(s.status === 'submitted' && !s.terms.length, 'This application is not awaiting an award.')
      const { plan, review } = requireCommitteeMember(s, c.planId, projectVersionId, actorId, context.committeeRoster, true)
      const { totalMinor, milestoneAmounts, reason } = c
      const milestoneIds = new Set(milestoneAmounts.map((milestone) => milestone.milestoneId))
      need(milestoneAmounts.length === plan.answers.milestones.length && milestoneIds.size === milestoneAmounts.length &&
        plan.answers.milestones.every(({ milestoneId }) => milestoneIds.has(milestoneId)),
      'Enter one allocation for each milestone in the pinned plan.')
      need(totalMinor > 0 && totalMinor <= (plan.answers.amountMinor ?? 0), 'The award amount must be positive and cannot exceed the pinned request.')
      need(milestoneAmounts.reduce((sum, milestone) => sum + milestone.amountMinor, 0) === totalMinor,
        'The milestone allocations must add up to the award amount.')
      review.requests.push({ ...meta, planId: plan.id, totalMinor, milestoneAmounts, reason, votes: [] })
      break
    }
    case 'respond_award_amount': {
      if (s.version !== 4 || !s.committeeReview) throw new ActionError('Award amount requests are unavailable.')
      need(s.status === 'submitted' && !s.terms.length, 'This application is not awaiting an award.')
      const { plan, review } = shortlistedReview(s, s.applications.at(-1)?.id, projectVersionId)
      const request = review.requests.at(-1)
      if (!request || request.id !== c.requestId || request.planId !== plan.id)
        throw new ActionError('Review the latest award amount request before responding.')
      need(!request.response, 'This award amount request was already answered.')
      request.response = { actorId, at: now, outcome: c.outcome, ...(c.note ? { note: c.note } : {}) }
      break
    }
    case 'vote_award': {
      if (s.version !== 4 || !committeeRequired) throw new ActionError('Committee voting is unavailable.')
      need(s.status === 'submitted' && !s.terms.length, 'This application is not awaiting an award.')
      const { plan, review } = requireCommitteeMember(s, s.applications.at(-1)?.id, projectVersionId, actorId, context.committeeRoster)
      const request = review.requests.at(-1)
      if (!request || request.id !== c.requestId || request.planId !== plan.id || request.response?.outcome !== 'accepted')
        throw new ActionError('The applicant must accept the latest award amount request before voting.')
      approvedPlan(s, s.planApproval?.planId, projectVersionId)
      need(allMilestonesVerified(s), 'Verify every milestone in the approved plan before voting.')
      need(!s.requests.some((r) => !r.answeredAt), 'Resolve open evidence requests first')
      const lastVote = request.votes.findLast((vote) => vote.actorId === actorId)
      need(lastVote?.vote !== c.vote || lastVote.note !== c.note, 'This vote is already recorded.')
      request.votes.push({ actorId, at: now, vote: c.vote, note: c.note })
      break
    }
    case 'clear_milestone': {
      if (s.version === 4) {
        need(s.status === 'submitted', 'Review the current pinned plan before approving it.')
        const plan = pinnedPlan(s, c.planId, projectVersionId)
        if (committeeRequired) requireCommitteeMember(s, plan.id, projectVersionId, actorId, context.committeeRoster)
        need(!s.planApproval, 'The milestone plan is already approved.')
        need(!s.requests.some((request) => !request.answeredAt), 'Resolve open evidence requests first')
        s.planApproval = { ...meta, planId: plan.id, projectVersionId }
        break
      }
      if (s.version !== 3) throw new ActionError('This application uses the previous grant workflow')
      need(!c.planId, 'This application uses its original milestone clearance.')
      const submitted = s.applications.at(-1)
      need(s.status === 'submitted' && submitted?.projectVersionId === projectVersionId, 'Review the current pinned submission before clearing the milestone')
      need(!s.milestoneClearance, 'The milestone is already cleared')
      need(!s.requests.some((request) => !request.answeredAt), 'Resolve open evidence requests first')
      s.milestoneClearance = { ...meta, applicationRevisionId: submitted!.id, projectVersionId }
      break
    }
    case 'hold_application':
    case 'decline_application': {
      if (s.version !== 4) throw new ActionError('Use the original decision workflow for this application.')
      need(s.status === 'submitted' && s.decisions.every((d) => d.outcome === 'deferred'), 'This application is not awaiting a decision')
      if (committeeRequired) requireCommitteeMember(s, s.applications.at(-1)?.id, projectVersionId, actorId, context.committeeRoster)
      const details = { ...meta, terms: null, rationale: c.rationale, publicNote: c.publicNote, ownerId: actorId }
      const decision = c.kind === 'hold_application'
        ? { ...details, outcome: 'deferred' as const, nextStep: c.nextStep }
        : { ...details, outcome: 'not_selected' as const }
      s.decisions.push(decision)
      s.status = decision.outcome
      break
    }
    case 'issue_award': {
      if (s.version !== 4) throw new ActionError('Use the original decision workflow for this application.')
      need(s.status === 'submitted' && !s.terms.length && s.decisions.every((d) => d.outcome === 'deferred'), 'This application is not awaiting an award')
      const committee = committeeRequired
        ? requireCommitteeMember(s, s.applications.at(-1)?.id, projectVersionId, actorId, context.committeeRoster).review
        : undefined
      const plan = approvedPlan(s, s.planApproval?.planId, projectVersionId)
      need(allMilestonesVerified(s), 'Verify every milestone in the approved plan before issuing an award.')
      need(!s.requests.some((r) => !r.answeredAt), 'Resolve open evidence requests first')
      const authorization = context.awardAuthorization
      const request = committee?.requests.at(-1)
      if (committee) {
        if (!request || request.planId !== plan.id || request.response?.outcome !== 'accepted')
          throw new ActionError('The applicant must accept the latest award amount request before issuance.')
        const result = committeeVoteResult(committee.shortlist, request)
        need(result.passed, result.rule === 'unanimity'
          ? 'Every Committee member assigned to this application must approve the accepted award amount.'
          : 'The accepted award proposal has not passed the assigned Committee voting rule.')
      }
      const reasons = readiness(s, authorization?.terms.route)
      need(!reasons.length, reasons.join('; '))
      if (!authorization?.authority.trim() || !authorization.budget.trim())
        throw new ActionError('Award issuance is unavailable until Committee and Finance approval can be verified.')
      const { terms: award, budget, authority } = authorization
      if (request) need(authorization.awardRequestId === request.id && award.amountMinor === request.totalMinor,
        'The authorized award must match the accepted amount request and total.')
      need(award.amountMinor <= (plan.answers.amountMinor ?? 0), 'The award cannot exceed the pinned request.')
      const scope = planAwardScope(plan.answers.milestones)
      need(scope && award.title === scope.title && award.acceptance === scope.acceptance && award.due === scope.due,
        'Award terms must match the verified milestone plan.')
      if (award.route === 'bounded_pilot')
        need(award.hypothesis.trim() && award.limits.trim(), 'Record the pilot hypothesis and limits')
      s.terms.push({ ...meta, number: 1, terms: award, confirmedAt: null, confirmedById: null })
      s.decisions.push({ ...meta, outcome: 'approved', terms: award, rationale: c.rationale,
        publicNote: c.publicNote, ownerId: actorId, budget, authority })
      if (committee && request) committee.issuedRequestId = request.id
      s.status = 'approved'
      break
    }
    case 'record_decision':
      if (s.version === 4) throw new ActionError('Use the Grants Committee decision workflow for this application.')
      need(
        s.status === 'submitted' && s.decisions.every((d) => d.outcome === 'deferred'),
        'This application is not awaiting a decision',
      )
      if (c.outcome === 'approved') {
        if (s.version === 3) {
          requirePinnedClearance(s, projectVersionId, 'Verify evidence for the cleared milestone before issuing an award')
          need(s.deliveries.at(-1)?.state === 'accepted', 'Verify evidence for the cleared milestone before issuing an award')
          const milestone = s.answers.milestone
          need(milestone && c.terms?.title === milestone.title && c.terms.acceptance === milestone.evidence &&
            c.terms.due === milestone.due, 'Award terms must match the pinned milestone, completion evidence and target date')
        }
        need(c.terms, 'Approval requires agreed terms')
        need(c.budget.trim(), 'Record the budget authority')
        need(!s.requests.some((r) => !r.answeredAt), 'Resolve open evidence requests first')
        const reasons = readiness(s, c.terms!.route)
        need(!reasons.length, reasons.join('; '))
        need(s.version === 3 || c.terms!.due >= today, 'Target date must be today or later')
        if (c.terms!.route === 'bounded_pilot')
          need(c.terms!.hypothesis.trim() && c.terms!.limits.trim(), 'Record the pilot hypothesis and limits')
        s.terms.push({ ...meta, number: 1, terms: c.terms!, confirmedAt: null, confirmedById: null })
      }
      s.decisions.push({
        ...meta,
        outcome: c.outcome,
        terms: c.terms,
        rationale: c.rationale,
        publicNote: c.publicNote,
        ownerId: c.ownerId,
        budget: c.budget,
        authority: c.authority,
      })
      s.status = c.outcome
      break
    case 'confirm_terms': {
      need(s.version === 2, 'This issued award requires no applicant confirmation')
      const t = s.terms.at(-1)
      need(t && !t.confirmedAt && s.status === 'approved', 'No terms await confirmation')
      t!.confirmedAt = now
      t!.confirmedById = actorId
      break
    }
    case 'submit_delivery': {
      const delivery = {
        ...meta, release: c.release, reproduction: c.reproduction, note: c.note, state: 'submitted' as const, review: null,
      }
      if (s.version === 4) {
        need(s.status === 'submitted', 'This application is no longer under review')
        const plan = approvedPlan(s, c.planId, projectVersionId)
        const milestone = plan.answers.milestones.find((item) => item.milestoneId === c.milestoneId)
        if (!milestone) throw new ActionError('Choose a milestone from the current approved plan.')
        const last = s.deliveries.findLast((d) => d.planId === plan.id && d.milestoneId === milestone.milestoneId)
        need(c.previousAttemptId === (last?.id ?? null), 'Refresh the current evidence attempt before resubmitting.')
        need(!last || last.state === 'changes_requested', 'The current milestone evidence is already submitted or verified.')
        s.deliveries.push({ ...delivery, planId: plan.id, milestoneId: milestone.milestoneId, termsVersion: null })
        break
      }
      need(!c.planId && !c.milestoneId && c.previousAttemptId === undefined, 'This application uses its original delivery workflow.')
      need(!['submitted', 'accepted'].includes(s.deliveries.at(-1)?.state ?? ''), 'The current delivery is already submitted or accepted')
      if (s.version === 3) {
        need(s.status === 'submitted', 'This application is no longer under review')
        requirePinnedClearance(s, projectVersionId, 'Clear the current pinned milestone before submitting evidence')
        s.deliveries.push({ ...delivery, termsVersion: null })
      } else {
        const terms = activeTerms(s)
        need(terms && !pendingAmendment(s), 'Confirm the active terms and resolve amendments first')
        s.deliveries.push({ ...delivery, termsVersion: terms!.number })
      }
      break
    }
    case 'review_delivery': {
      let d
      if (s.version === 4) {
        need(s.status === 'submitted', 'This application is no longer under review')
        const plan = approvedPlan(s, c.planId, projectVersionId)
        need(plan.answers.milestones.some((item) => item.milestoneId === c.milestoneId), 'Choose a milestone from the current approved plan.')
        d = s.deliveries.findLast((item) => item.planId === plan.id && item.milestoneId === c.milestoneId)
      } else {
        need(!c.planId && !c.milestoneId, 'This application uses its original delivery workflow.')
        d = s.deliveries.at(-1)
      }
      need(d?.id === c.deliveryId && d.state === 'submitted', 'Only the current submitted delivery can be reviewed')
      if (s.version === 3) {
        need(s.status === 'submitted', 'This application is no longer under review')
        requirePinnedClearance(s, projectVersionId, 'Evidence is not for the current cleared milestone')
      } else if (s.version === 2) {
        need(d!.termsVersion === activeTerms(s)?.number && !pendingAmendment(s), 'Delivery terms are stale or amendment is pending')
      }
      if (c.outcome === 'accepted') need(c.inspected && c.reproduced && c.matches, 'All acceptance checks are required')
      d!.state = c.outcome
      d!.review = { note: c.note, evidence: c.evidence, verifierId: actorId, at: now }
      break
    }
    case 'report_payment': {
      need(s.version === 2 || s.status === 'approved', 'Issue the award before recording a payment')
      need(s.version === 4 ? allMilestonesVerified(s) : s.deliveries.at(-1)?.state === 'accepted', 'Accept the milestone before recording payment')
      const t = totals(s)
      need(c.amountMinor <= t.remaining - t.reserved, 'Amount exceeds the unreserved obligation')
      need(!s.payments.some((p) => p.reference === c.reference), 'This external reference is already recorded')
      need(c.date <= today, 'Payment report date cannot be in the future')
      s.payments.push({
        ...meta,
        reference: c.reference,
        amountMinor: c.amountMinor,
        date: c.date,
        evidence: c.evidence,
        state: 'reported',
        note: c.note,
      })
      break
    }
    case 'reconcile_payment': {
      const p = s.payments.find((p) => p.id === c.paymentId)
      need(p, 'Payment record not found')
      if (p!.state === 'confirmed')
        need(c.state === 'reversed' || c.state === 'disputed', 'Preserve confirmed payment history; record a reversal or dispute')
      if (c.state === 'confirmed') need(totals(s).paid + p!.amountMinor <= totals(s).approved, 'Confirmation exceeds the approved amount')
      p!.state = c.state
      p!.evidence = c.evidence
      p!.note = c.note
      need(totals(s).paid + totals(s).reserved <= totals(s).approved, 'Reconciliation would exceed the approved obligation')
      if (s.closedAt && (c.state === 'reversed' || c.state === 'disputed')) s.closedAt = null
      break
    }
    case 'submit_amendment': {
      need(s.version === 2, 'Changes to a cleared milestone are not supported in this workflow')
      const t = activeTerms(s)
      need(t && s.status === 'approved', 'Confirm original terms first')
      need(
        !s.payments.length && !['submitted', 'accepted'].includes(s.deliveries.at(-1)?.state ?? ''),
        'Amend only before delivery acceptance and payment records',
      )
      need(!pendingAmendment(s) || pendingAmendment(s)?.state === 'changes_requested', 'Resolve the pending amendment first')
      need(c.terms.due >= today, 'Amended target date must be today or later')
      const amendmentTerms = s.answers.intakeVersion === 2
        ? { ...t!.terms, ...publicAwardTerms.parse(c.terms) }
        : terms.safeParse(c.terms).data
      if (!amendmentTerms) throw new ActionError('Complete the original award terms.')
      if (pendingAmendment(s)) pendingAmendment(s)!.state = 'withdrawn'
      s.amendments.push({
        ...meta,
        baseVersion: t!.number,
        terms: amendmentTerms,
        reason: c.reason,
        state: 'submitted',
        renewed: false,
        review: '',
        authority: '',
      })
      break
    }
    case 'review_amendment': {
      const a = pendingAmendment(s)
      need(a?.id === c.amendmentId && a.state === 'submitted', 'Only the submitted amendment can be reviewed')
      need(a!.baseVersion === activeTerms(s)?.number, 'Amendment base terms are stale')
      if (c.state === 'approved') need(c.renewed, 'Renew scope, funding, rights, conflicts and risk checks for these amended terms')
      if (c.state === 'approved') need(!readiness(s, a!.terms.route).length, 'Renew readiness checks before approval')
      a!.state = c.state
      a!.renewed = c.renewed
      a!.review = c.review
      a!.authority = c.authority
      break
    }
    case 'respond_amendment': {
      const a = pendingAmendment(s)
      need(a?.id === c.amendmentId, 'Amendment is not pending')
      if (c.response !== 'withdrawn') need(a!.state === 'approved', 'Only approved amendments can be confirmed or declined')
      if (c.response === 'confirmed') {
        need(a!.baseVersion === activeTerms(s)?.number, 'Amendment base terms are stale')
        s.terms.push({ ...meta, number: s.terms.length + 1, terms: a!.terms, confirmedAt: now, confirmedById: actorId })
      }
      a!.state = c.response
      break
    }
    case 'save_followup': {
      const old = c.followupId ? s.followups.find((f) => f.id === c.followupId) : null
      need(!c.followupId || old, 'Follow-up not found')
      if (old) Object.assign(old, { title: c.title, ownerId: c.ownerId, due: c.due, waitingOn: c.waitingOn, note: c.note })
      else
        s.followups.push({
          ...meta,
          title: c.title,
          ownerId: c.ownerId,
          due: c.due,
          waitingOn: c.waitingOn,
          state: 'open',
          note: c.note,
          reminderDraft: '',
        })
      break
    }
    case 'finish_followup': {
      const f = s.followups.find((f) => f.id === c.followupId)
      need(f, 'Follow-up not found')
      f!.state = c.reopen ? 'open' : 'completed'
      f!.note = c.note
      break
    }
    case 'draft_reminder': {
      const f = s.followups.find((f) => f.id === c.followupId)
      need(f && f.state === 'open', 'Follow-up is not open')
      f!.reminderDraft = c.body
      break
    }
    case 'set_impact_plan':
      need(s.version === 2 || s.status === 'approved', 'Issue the award before creating a monitoring plan')
      need((s.version === 4 ? allMilestonesVerified(s) : s.deliveries.at(-1)?.state === 'accepted') && !s.impact.length, 'Record the plan after acceptance and before reporting')
      need(new Set(c.metrics.map((m) => m.id)).size === c.metrics.length, 'Metric identifiers must be unique')
      s.impactPlan = { metrics: c.metrics, ownerId: c.ownerId }
      break
    case 'save_impact': {
      need(s.impactPlan && (s.version === 4 ? allMilestonesVerified(s) : s.deliveries.at(-1)?.state === 'accepted'), 'A monitoring plan and accepted delivery are required')
      const last = s.impact.findLast((r) => r.day === c.day)
      need(last?.state !== 'reviewed' && last?.state !== 'submitted', 'This update is already submitted or reviewed')
      const expected = s.impactPlan!.metrics.map((m) => m.id)
      need(
        c.observations.length === expected.length &&
          new Set(c.observations.map((o) => o.metricId)).size === expected.length &&
          c.observations.every((o) => expected.includes(o.metricId)),
        'Report each planned metric exactly once',
      )
      if (c.submit) { const acceptedAt = deliveryAcceptedAt(s.deliveries, s.version === 4); need(acceptedAt && today >= addDays(acceptedAt.slice(0, 10), Number(c.day)), 'This checkpoint is not due yet. Save a draft instead.') }
      if (c.submit)
        need(
          c.observations.every((o) => o.value === null || (o.evidence.trim() && o.method.trim())),
          'Every measured value requires evidence and method',
        )
      s.impact.push({
        ...meta,
        day: c.day,
        observations: c.observations,
        narrative: c.narrative,
        state: c.submit ? 'submitted' : 'draft',
        review: '',
      })
      break
    }
    case 'review_impact': {
      const r = s.impact.find((r) => r.id === c.impactId)
      need(r && r.state === 'submitted' && s.impact.findLast((i) => i.day === r.day)?.id === r.id, 'Review the current submitted update')
      r!.state = c.state
      r!.review = c.review
      break
    }
    case 'close_impact':
      need(
        ['30', '90', '180'].every((d) => s.impact.findLast((i) => i.day === d)?.state === 'reviewed'),
        'Review all three checkpoints before close-out',
      )
      need(
        totals(s).remaining === 0 && s.payments.every((p) => ['confirmed', 'failed', 'reversed'].includes(p.state)),
        'Reconcile all settlement records before close-out',
      )
      s.closedAt = now
      break
  }
  s.events.push({
    ...meta,
    kind: c.kind,
    note: c.kind === 'release_review_status'
      ? applicationStatusCopy[c.status].label
      : 'note' in c && c.note ? c.note : 'reason' in c ? c.reason : 'review' in c ? c.review : c.kind.replaceAll('_', ' '),
  })
  return stateSchema.parse(c.kind === 'submit_application' && context.milestoneFirst && s.version === 2 && s.answers.intakeVersion === 2
    ? { ...s, version: 3, milestoneClearance: null }
    : s)
}

export const applicationStatusCopy = {
  draft: { label: 'Draft', detail: 'Complete and submit your application to enter review.' },
  submitted: { label: 'Submitted', detail: 'We received your application and will review it.' },
  in_review: { label: 'In review', detail: 'The grant team is assessing your application.' },
  shortlisted: { label: 'Shortlisted', detail: 'Your application is being actively considered for funding. A final decision is pending.' },
  approval_pending: { label: 'Approval pending', detail: 'Reviewers recommended funding. Final authorization is pending.' },
  approved: { label: 'Approved', detail: 'The award decision is recorded. Review the terms and next steps.' },
  deferred: { label: 'Deferred', detail: 'The grant team has put the decision on hold. Check the decision note for next steps.' },
  not_selected: { label: 'Not selected', detail: 'This application was not selected. Check the decision note for feedback and any reapplication route.' },
  withdrawn: { label: 'Withdrawn', detail: 'Your team withdrew this application.' },
}

const committeeStatuses: Partial<Record<keyof typeof applicationStatusCopy, { label: string; detail: string }>> = {
  submitted: { label: 'Submitted', detail: 'The Grants Committee will review your application.' },
  in_review: { label: 'In review', detail: 'The Grants Committee is reviewing your application.' },
  approved: { label: 'Award issued', detail: 'Review your award and the next steps.' },
  deferred: { label: 'On hold', detail: 'The Grants Committee paused your application. See the reason and next step below.' },
  not_selected: { label: 'Declined', detail: 'The Grants Committee declined this application. See the feedback and reapplication guidance.' },
}

export function applicationStatusText(status: keyof typeof applicationStatusCopy, committee: boolean) {
  return (committee ? committeeStatuses[status] : undefined) ?? applicationStatusCopy[status]
}

export function applicationStatus(s: GrantState) {
  const release = s.statusReleases.at(-1)
  let status: keyof typeof applicationStatusCopy = s.status
  if (status === 'submitted' && release) {
    status = release.status
    if (release.status === 'approval_pending') {
      const reply = latestReplyRequiringAssessment(s)
      const releasedAt = reply === -1 ? -1
        : s.events.findIndex((event) => event.kind === 'release_review_status' && event.id === release.id)
      if (release.applicationRevisionId !== s.applications.at(-1)?.id ||
        (reply !== -1 && !reassessedAfter(s, reply, releasedAt))) status = 'in_review'
    }
  }
  return {
    status,
    updateRequested: s.status === 'submitted' && s.requests.some((request) => !request.answeredAt),
  }
}

/** Public projection is an allowlist. Internal notes, scores, authority and finance references never leave the server. */
function applicantIntake(value: IntakeAnswers): IntakeAnswers {
  if (value.intakeVersion === 3) return {
    intakeVersion: 3, amountMinor: value.amountMinor, summary: value.summary,
    milestones: value.milestones.map((milestone) => {
      const commitment = { title: milestone.title, due: milestone.due, evidence: milestone.evidence }
      return milestone.source === 'roadmap' ? { source: 'roadmap', id: milestone.id, ...commitment } : { source: 'application', ...commitment }
    }),
  }
  if (value.intakeVersion !== 2) return value
  const milestone = value.milestone
  const result: ShortIntake = {
    intakeVersion: 2, amountMinor: value.amountMinor, summary: value.summary, milestone: null,
  }
  if (milestone) {
    const commitment = { title: milestone.title, due: milestone.due, evidence: milestone.evidence }
    result.milestone = milestone.source === 'roadmap'
      ? { source: 'roadmap', id: milestone.id, ...commitment }
      : { source: 'application', ...commitment }
  }
  return result
}

export function applicantProjection(s: GrantState) {
  const award = (value: GrantState['terms'][number]['terms']) => {
    if (s.answers.intakeVersion === undefined) return value
    return (s.version === 4 ? committeePublicAwardTerms : publicAwardTerms).parse(value)
  }
  const request = s.version === 4 ? s.committeeReview?.requests.at(-1) : undefined
  const awardAmountRequest = request && {
    id: request.id,
    planId: request.planId,
    totalMinor: request.totalMinor,
    milestoneAmounts: request.milestoneAmounts.map(({ milestoneId, amountMinor }) => ({ milestoneId, amountMinor })),
    reason: request.reason,
    ...(request.response && { response: {
      outcome: request.response.outcome,
      at: request.response.at,
      ...(request.response.note ? { note: request.response.note } : {}),
    } }),
  }
  return {
    status: s.status,
    milestoneFirst: s.version === 3 || s.version === 4,
    clearedAt: s.version === 3 ? s.milestoneClearance?.at ?? null : s.version === 4 ? s.planApproval?.at ?? null : null,
    milestonePlan: milestonePlan(s),
    ...(awardAmountRequest && { awardAmountRequest }),
    withdrawnAt: s.events.findLast((event) => event.kind === 'withdraw_application')?.at ?? null,
    applicantStatus: applicationStatus(s),
    statusReleases: s.statusReleases.map(({ id, at, status }) => ({ id, at, status })),
    answers: applicantIntake(s.answers),
    applications: s.applications.map((a) => ({ id: a.id, at: a.at, projectVersionId: a.projectVersionId, answers: applicantIntake(a.answers) })),
    requests: s.requests.map((r) => ({ id: r.id, at: r.at, title: r.title, body: r.body, ...(r.due ? { due: r.due } : {}), reply: r.reply, answeredAt: r.answeredAt })),
    decisions: s.decisions.map((d) => ({ outcome: d.outcome, publicNote: d.publicNote, at: d.at,
      ...('nextStep' in d && d.nextStep ? { nextStep: d.nextStep } : {}),
    })),
    terms: s.terms.map((t) => ({ number: t.number, terms: award(t.terms), confirmedAt: t.confirmedAt })),
    deliveries: s.deliveries.map((d) => ({
      id: d.id,
      at: d.at,
      termsVersion: d.termsVersion,
      release: d.release,
      reproduction: d.reproduction,
      note: d.note,
      state: d.state,
      ...('milestoneId' in d ? { milestoneId: d.milestoneId, planId: d.planId } : {}),
      review: d.review ? { note: d.review.note, at: d.review.at } : null,
    })),
    payments: s.payments.map((p) => ({ id: p.id, date: p.date, amountMinor: p.amountMinor, state: p.state })),
    amendments: s.amendments.map((a) => ({
      id: a.id,
      at: a.at,
      baseVersion: a.baseVersion,
      terms: award(a.terms),
      reason: a.reason,
      state: a.state,
      review: a.review,
    })),
    impactPlan: s.impactPlan ? { metrics: s.impactPlan.metrics } : null,
    impact: s.impact.map((i) => ({
      id: i.id,
      day: i.day,
      at: i.at,
      observations: i.observations,
      narrative: i.narrative,
      state: i.state,
      review: i.review,
    })),
    closedAt: s.closedAt,
    totals: totals(s),
  }
}

export function statusLabel(
  s: Pick<
    ReturnType<typeof applicantProjection>,
    'status' | 'closedAt' | 'requests' | 'terms' | 'deliveries' | 'amendments' | 'payments' | 'impact'
  >,
  staff = false,
) {
  if (s.closedAt) return 'Closed'
  if (s.status === 'draft') return 'Draft'
  if (s.status === 'deferred') return 'Deferred'
  if (s.status === 'not_selected') return 'Not selected'
  if (s.status === 'withdrawn') return 'Withdrawn'
  if (s.status === 'submitted')
    return s.requests.some((r) => !r.answeredAt) ? (staff ? 'Awaiting applicant' : 'Update requested') : 'In review'
  const terms = s.terms.findLast((t) => t.confirmedAt)
  if (!terms) return 'Awaiting confirmation'
  if (s.amendments.some((a) => ['submitted', 'changes_requested', 'approved'].includes(a.state))) return 'Amendment review'
  const delivery = s.deliveries.at(-1)
  if (!delivery) return 'Milestone in progress'
  if (delivery.state === 'submitted') return staff ? 'Verify delivery' : 'Awaiting verification'
  if (delivery.state === 'changes_requested') return 'Changes requested'
  if (s.payments.filter((p) => p.state === 'confirmed').reduce((n, p) => n + p.amountMinor, 0) < terms.terms.amountMinor)
    return 'Awaiting payment'
  if (s.impact.some((r) => r.state === 'submitted')) return staff ? 'Impact review' : 'Update submitted'
  return 'Outcome monitoring'
}
