import { canEditProject } from '@/lib/project-submission'
import { ActionError } from '@/lib/action-error'
import type { Permission } from '@/lib/permissions'
import { can, type AuthzUser } from '@/lib/permissions'
import { stateSchema, answers, shortSubmission, publicAwardTerms, terms, type IntakeAnswers, type ShortIntake, criterionIds, clearanceIds, type Answers, type Assessment, type Command, type GrantState } from './schemas'

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
    version: 2,
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
export const activeTerms = (s: GrantState) => s.version === 3
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
  'confirm_terms',
  'submit_delivery',
  'submit_amendment',
  'respond_amendment',
  'save_impact',
]
export function commandPermission(kind: Command['kind']): Permission | 'applicant' {
  if (applicantCommands.includes(kind)) return 'applicant'
  if (['clear_milestone', 'record_decision', 'review_amendment', 'release_review_status', 'reopen_application'].includes(kind)) return 'grants.decide'
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
function latestClearedReply(s: GrantState) {
  if (s.version !== 3 || !s.milestoneClearance) return -1
  const clearanceId = s.milestoneClearance.id
  const clearance = s.events.findIndex((event) => event.kind === 'clear_milestone' && event.id === clearanceId)
  const reply = s.events.findLastIndex((event) => event.kind === 'answer_request')
  return clearance !== -1 && reply > clearance ? reply : -1
}

function reassessedAfter(s: GrantState, reply: number, before = s.events.length) {
  return s.events.some((event, index) => index > reply && index < before && event.kind === 'save_assessment')
}

export function transition(
  previous: GrantState,
  command: Command,
  context: { id: string; actorId: string; now: string; projectVersionId: string; milestoneFirst?: boolean },
) {
  const s = structuredClone(previous),
    c = command,
    { id, actorId, now, projectVersionId } = context
  const meta = { id, actorId, at: now },
    today = now.slice(0, 10)
  need(!s.closedAt || c.kind === 'reconcile_payment', 'This grant is closed')
  switch (c.kind) {
    case 'save_application':
      need(s.status === 'draft', 'Submitted applications are immutable; answer a request instead')
      need(s.answers.intakeVersion === c.answers.intakeVersion, 'Continue using the original form for this draft')
      if (s.version === 3) throw new ActionError('This application was already submitted')
      s.answers = c.answers
      break
    case 'submit_application':
      if (s.version === 3 || s.status !== 'draft') throw new ActionError('This application was already submitted')
      {
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
      if (c.status === 'approval_pending') {
        const reply = latestClearedReply(s)
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
      if (!sameMilestone) s.applications.push({ ...meta, answers: structuredClone(s.answers), projectVersionId })
      break
    }
    case 'clear_milestone': {
      if (s.version !== 3) throw new ActionError('This application uses the previous grant workflow')
      const submitted = s.applications.at(-1)
      need(s.status === 'submitted' && submitted?.projectVersionId === projectVersionId, 'Review the current pinned submission before clearing the milestone')
      need(!s.milestoneClearance, 'The milestone is already cleared')
      need(!s.requests.some((request) => !request.answeredAt), 'Resolve open evidence requests first')
      s.milestoneClearance = { ...meta, applicationRevisionId: submitted!.id, projectVersionId }
      break
    }
    case 'record_decision':
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
      need(s.version !== 3, 'This issued award requires no applicant confirmation')
      const t = s.terms.at(-1)
      need(t && !t.confirmedAt && s.status === 'approved', 'No terms await confirmation')
      t!.confirmedAt = now
      t!.confirmedById = actorId
      break
    }
    case 'submit_delivery': {
      need(!['submitted', 'accepted'].includes(s.deliveries.at(-1)?.state ?? ''), 'The current delivery is already submitted or accepted')
      const delivery = {
        ...meta, release: c.release, reproduction: c.reproduction, note: c.note, state: 'submitted' as const, review: null,
      }
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
      const d = s.deliveries.at(-1)
      need(d?.id === c.deliveryId && d.state === 'submitted', 'Only the current submitted delivery can be reviewed')
      if (s.version === 3) {
        need(s.status === 'submitted', 'This application is no longer under review')
        requirePinnedClearance(s, projectVersionId, 'Evidence is not for the current cleared milestone')
      } else {
        need(d!.termsVersion === activeTerms(s)?.number && !pendingAmendment(s), 'Delivery terms are stale or amendment is pending')
      }
      if (c.outcome === 'accepted') need(c.inspected && c.reproduced && c.matches, 'All acceptance checks are required')
      d!.state = c.outcome
      d!.review = { note: c.note, evidence: c.evidence, verifierId: actorId, at: now }
      break
    }
    case 'report_payment': {
      need(s.version !== 3 || s.status === 'approved', 'Issue the award before recording a payment')
      need(s.deliveries.at(-1)?.state === 'accepted', 'Accept the milestone before recording payment')
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
      need(s.version !== 3, 'Changes to a cleared milestone are not supported in this workflow')
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
      need(s.version !== 3 || s.status === 'approved', 'Issue the award before creating a monitoring plan')
      need(s.deliveries.at(-1)?.state === 'accepted' && !s.impact.length, 'Record the plan after acceptance and before reporting')
      need(new Set(c.metrics.map((m) => m.id)).size === c.metrics.length, 'Metric identifiers must be unique')
      s.impactPlan = { metrics: c.metrics, ownerId: c.ownerId }
      break
    case 'save_impact': {
      need(s.impactPlan && s.deliveries.at(-1)?.state === 'accepted', 'A monitoring plan and accepted delivery are required')
      const last = s.impact.findLast((r) => r.day === c.day)
      need(last?.state !== 'reviewed' && last?.state !== 'submitted', 'This update is already submitted or reviewed')
      const expected = s.impactPlan!.metrics.map((m) => m.id)
      need(
        c.observations.length === expected.length &&
          new Set(c.observations.map((o) => o.metricId)).size === expected.length &&
          c.observations.every((o) => expected.includes(o.metricId)),
        'Report each planned metric exactly once',
      )
      if (c.submit) { const accepted = s.deliveries.findLast((d) => d.state === 'accepted'); need(accepted?.review?.at && today >= addDays(accepted.review.at.slice(0, 10), Number(c.day)), 'This checkpoint is not due yet. Save a draft instead.') }
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
      : 'note' in c ? c.note : 'reason' in c ? c.reason : 'review' in c ? c.review : c.kind.replaceAll('_', ' '),
  })
  return stateSchema.parse(c.kind === 'submit_application' && context.milestoneFirst && s.answers.intakeVersion === 2
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

export function applicationStatus(s: GrantState) {
  const release = s.statusReleases.at(-1)
  let status: keyof typeof applicationStatusCopy = s.status
  if (status === 'submitted' && release) {
    status = release.status
    if (release.status === 'approval_pending') {
      const reply = latestClearedReply(s)
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
  const award = (value: GrantState['terms'][number]['terms']) =>
    s.answers.intakeVersion === 2 ? publicAwardTerms.parse(value) : value
  return {
    status: s.status,
    milestoneFirst: s.version === 3,
    clearedAt: s.version === 3 ? s.milestoneClearance?.at ?? null : null,
    withdrawnAt: s.events.findLast((event) => event.kind === 'withdraw_application')?.at ?? null,
    applicantStatus: applicationStatus(s),
    statusReleases: s.statusReleases.map(({ id, at, status }) => ({ id, at, status })),
    answers: applicantIntake(s.answers),
    applications: s.applications.map((a) => ({ id: a.id, at: a.at, projectVersionId: a.projectVersionId, answers: applicantIntake(a.answers) })),
    requests: s.requests.map((r) => ({ id: r.id, at: r.at, title: r.title, body: r.body, ...(r.due ? { due: r.due } : {}), reply: r.reply, answeredAt: r.answeredAt })),
    decisions: s.decisions.map((d) => ({ outcome: d.outcome, publicNote: d.publicNote, at: d.at })),
    terms: s.terms.map((t) => ({ number: t.number, terms: award(t.terms), confirmedAt: t.confirmedAt })),
    deliveries: s.deliveries.map((d) => ({
      id: d.id,
      at: d.at,
      termsVersion: d.termsVersion,
      release: d.release,
      reproduction: d.reproduction,
      note: d.note,
      state: d.state,
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
