import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { GrantCaseView } from '@/app/(site)/grants/_components/case-view'
import { addDays, applicantProjection, initialState, transition } from '@/app/(site)/grants/_lib/rules'
import { answers, clearanceIds, criterionIds, type GrantState } from '@/app/(site)/grants/_lib/schemas'

// The decision to mount a form belongs to the case view. The client form
// itself needs an app router and is exercised by the browser flow.
vi.mock('@/app/(site)/grants/_components/command-form', () => ({
  GrantCommandForm: ({ label, data, triggerAriaLabel, fields }: { label: string; data: { kind: string }; triggerAriaLabel?: string; fields: { path: string; label: string }[] }) =>
    createElement('div', null, createElement('button', { 'data-command': data.kind, 'aria-label': triggerAriaLabel }, label),
      ...fields.filter((field) => ['note', 'release', 'reproduction'].includes(field.path))
        .map((field) => createElement('textarea', { key: field.path, 'aria-label': field.label }))),
}))
vi.mock('@/app/(site)/grants/_components/short-grant-form', () => ({ ShortGrantForm: () => null }))
vi.mock('@/app/(site)/grants/_lib/config', () => ({ shortIntakeEnabled: () => false }))
vi.mock('@/components/data-table', () => ({ DataTable: () => null }))

vi.mock('@/hooks/use-action-toast', () => ({ useActionToast: () => ({ pending: false }) }))
vi.mock('@/app/(site)/grants/_lib/actions', () => ({ changeApplication: vi.fn() }))
type StaffCase = Extract<Parameters<typeof GrantCaseView>[0]['data'], { staff: true }>
type ApplicantCase = Extract<Parameters<typeof GrantCaseView>[0]['data'], { staff: false }>

const date = new Date('2026-11-12T12:00:00.000Z')
const application = answers.parse({
  problem: 'Documentation gap',
  outcome: 'A reproducible quickstart',
  capability: 'Published examples',
  funding: 'No overlapping support',
  maintenance: 'Maintained by the project team',
  risks: 'Testnet dependency',
  costs: [{ title: 'Documentation', amountMinor: 500000 }],
  terms: {
    title: 'Publish the quickstart',
    acceptance: 'Reproduce the example',
    amountMinor: 500000,
    due: '2026-12-01',
    maintainer: 'Project team',
    verifier: 'Independent reviewer',
    route: 'bounded_pilot',
    hypothesis: 'Developers can reproduce the example',
    limits: 'Testnet only',
  },
})

function applicantCase(state: ApplicantCase['state'], writer: boolean): ApplicantCase {
  return {
    id: 'case-1',
    projectId: 'project-1',
    projectVersionId: 'version-1',
    revision: 1,
    name: 'Synthetic project',
    round: 'Synthetic round',
    roundOpen: false,
    continuous: false,
    demoProofMissing: false,
    projectSlug: 'synthetic-project',
    userId: 'member-1',
    writer,
    staff: false,
    draftProject: null,
    state,
    milestones: [],
    projectVersion: {
      id: 'version-1', projectId: 'project-1', number: 1, name: 'Synthetic project',
      shortDescription: '', fullDescription: '', techDescription: '', techStack: [], categories: [],
      maturity: 'prototype', launchDate: null, country: null, otherCategory: null,
      githubRepos: [], demoLinks: [], videoUrl: null, logoUrl: null, coverUrl: null, screenshots: [],
      deployedAddresses: [], websiteUrl: null, websites: [], socials: [], note: null, createdById: null,
      createdAt: date, sealedAt: date, updatedAt: date,
    },
  }
}
function renderCase(state: ApplicantCase['state'], writer: boolean, tab = 'Overview') {
  return renderToStaticMarkup(createElement(GrantCaseView, { data: applicantCase(state, writer), requestedTab: tab }))
}

function renderStaffCase(state: GrantState, decide = true, tab?: string, verify = false) {
  const data: StaffCase = {
    ...applicantCase(applicantProjection(state), false), staff: true, state,
    userId: 'reviewer', owners: [{ value: 'reviewer', label: 'Synthetic reviewer' }],
    capabilities: { review: true, decide, verify, payments: false, manage: false },
  }
  return renderToStaticMarkup(createElement(GrantCaseView, { data, requestedTab: tab }))
}

function awarded(confirmedAt: string | null = null) {
  const state = applicantProjection({ ...initialState(application), status: 'approved' })
  state.terms.push({ number: 1, terms: { ...application.terms, title: 'Ship only the code sample', amountMinor: 250000 }, confirmedAt })
  state.decisions.push({ outcome: 'approved', publicNote: 'Agreed scope', at: date.toISOString() })
  return state
}

describe('Applicant grants case', () => {
  it('Grants v1 US-4 shows the pinned request, demo and commitments in the application receipt', () => {
    const plan = {
      intakeVersion: 3 as const, amountMinor: 480000, summary: 'Fund the synthetic replay feature',
      milestones: [
        { source: 'application' as const, title: 'Publish the replay sample', due: '2026-12-01', evidence: 'A replay recording' },
        { source: 'application' as const, title: 'Publish the test cases', due: '2026-12-02', evidence: 'Passing test output' },
      ],
    }
    const state = transition(initialState(plan), { kind: 'submit_application', confirm: true, planAnswers: plan }, {
      id: 'private-plan-id', actorId: 'member-1', now: date.toISOString(), projectVersionId: 'version-1',
    })
    const data = applicantCase(applicantProjection(state), false)
    data.continuous = true
    data.projectVersion.demoLinks = ['https://example.test/pinned-demo']
    const view = (requestedTab: string) => renderToStaticMarkup(createElement(GrantCaseView, { data, requestedTab }))

    for (const tab of ['Overview', 'Application details']) {
      const html = view(tab)
      expect(html).toContain('Application submitted')
      expect(html).toContain('Fund the synthetic replay feature')
      expect(html).toContain('$4,800')
      expect(html).toMatch(/Publish the replay sample[^]*2026-12-01[^]*A replay recording[^]*Publish the test cases[^]*2026-12-02[^]*Passing test output/)
      expect(html).toContain('https://example.test/pinned-demo')
      expect(html).not.toContain('private-plan-id')
    }
  })

  it('links readers to unconfirmed award terms and leaves the confirmation form writer-only', () => {
    const readerOverview = renderCase(awarded(), false)
    const writerOverview = renderCase(awarded(), true)
    const readerDecision = renderCase(awarded(), false, 'Decision')
    const termsLink = /<a\b[^>]*\bhref="\/grants\/applications\/case-1\?tab=Decision"[^>]*>/
    expect(readerOverview).toMatch(new RegExp(termsLink.source + 'Review award terms</a>'))
    expect(writerOverview).toContain('data-command="confirm_terms"')
    expect(readerOverview).not.toContain('data-command="confirm_terms"')
    expect(readerDecision).toContain('Agreed scope')
    expect(readerOverview).toContain('Ship only the code sample')
    expect(readerOverview).toContain('Agreed scope')
    expect(writerOverview.indexOf('$2,500.00')).toBeLessThan(writerOverview.indexOf('Confirm agreed terms'))
    expect(writerOverview).toContain('$5,000.00')
    expect(writerOverview).toContain('Original request')
    expect(readerDecision).not.toContain('data-command="confirm_terms"')
    expect(renderCase(awarded(), true, 'Decision')).toContain('data-command="confirm_terms"')
  })

  it('keeps the no-action overview distinct from intake and preserves draft closure', () => {
    const submitted = renderCase(applicantProjection({ ...initialState(application), status: 'submitted' }), true)
    expect(submitted).toContain('No action is needed right now.')
    expect(submitted).not.toMatch(/Closed to new applications|Project stage/)
    expect(submitted).toMatch(/Grant sections[^]*Overview<[^]*Application details<[^]*History</)
    expect([...submitted.matchAll(/data-command="withdraw_application"/g)]).toHaveLength(1)
    expect(renderCase(applicantProjection({ ...initialState(application), status: 'submitted' }), false)).not.toContain('data-command="withdraw_application"')
    const draft = renderCase(applicantProjection(initialState(application)), true)
    expect([...draft.matchAll(/Closed to new applications/g)]).toHaveLength(1)
    expect(draft).toContain('data-command="save_application"')
  })

  it.each([['shortlisted', 'Shortlisted'], ['approval_pending', 'In review']] as const)(
    'keeps the released status independent of two requests and receipts for %s', (status, after) => {
      const meta = { id: 'original', actorId: 'staff', now: date.toISOString(), projectVersionId: 'version-1' }
      let state = transition(initialState(application), { kind: 'submit_application', confirm: true }, meta)
      state = transition(state, { kind: 'release_review_status', status }, { ...meta, id: 'status' })
      state = transition(state, { kind: 'request_evidence', title: 'First question', body: 'Which demo?', due: '2026-12-01' }, { ...meta, id: 'first' })
      state = transition(state, { kind: 'request_evidence', title: 'Second question', body: 'Which tests?', due: '2026-12-02' }, { ...meta, id: 'second' })
      const reader = renderCase(applicantProjection(state), false)
      expect(reader).toContain('A project editor can respond.')
      expect(reader).not.toContain('data-command="answer_request"')
      const initial = renderCase(applicantProjection(state), true)
      expect(initial).toContain('aria-label="Respond to First question"')
      expect(initial).toContain('aria-label="Respond to Second question"')
      state = transition(state, { kind: 'answer_request', requestId: 'first', reply: 'A synthetic demo' }, { ...meta, id: 'reply' })
      const writer = renderCase(applicantProjection(state), true)
      expect(writer.indexOf(after)).toBeLessThan(writer.indexOf('Second question'))
      expect(writer).toMatch(/First question(?:(?!Respond by)[^])*Reply received[^]*A synthetic demo[^]*Second question[^]*Respond by/)
      expect(writer).toContain('aria-label="Respond to Second question"')
      expect(writer).not.toContain('aria-label="Respond to First question"')
      expect([...writer.matchAll(/data-command="answer_request"/g)]).toHaveLength(1)
      state = transition(state, { kind: 'answer_request', requestId: 'second', reply: 'Passing test results' }, { ...meta, id: 'second-reply' })
      const answered = renderCase(applicantProjection(state), false)
      expect(answered).toMatch(/First question[^]*A synthetic demo[^]*Second question[^]*Passing test results/)
      expect([...answered.matchAll(/Reply received/g)]).toHaveLength(2)
      expect(answered).not.toMatch(/Respond by|data-command="answer_request"/)
      const decided = renderCase(applicantProjection({ ...state, status: 'not_selected' }), false, 'Application details')
      expect(decided).toMatch(/Application details[^]*First question[^]*Reply received[^]*A synthetic demo/)
      expect(decided).toContain('Passing test results')
      expect(decided).not.toMatch(/Respond by|data-command="answer_request"/)
    },
  )

  it('puts the delivery step after confirmation and keeps v2 scope readable in reader-only mode', () => {
    const confirmed = renderCase(awarded(date.toISOString()), true)
    expect(confirmed).toContain('Award confirmation recorded')
    expect(confirmed).toContain('Submit milestone evidence')
    expect(confirmed).not.toContain('data-command="confirm_terms"')
    const short = applicantProjection(initialState({
      intakeVersion: 2, amountMinor: 125000, summary: 'Publish a demo',
      milestone: { source: 'application', title: 'Replay tester', due: '2026-12-01', evidence: 'A test recording' },
    }))
    const draft = renderCase(short, true)
    expect(draft).toContain('Editing and submitting short drafts is temporarily unavailable')
    expect(draft).toContain('A test recording')
  })

  it('links only due impact work and keeps proposed changes in their existing action path', () => {
    const confirmed = awarded(date.toISOString())
    const terms = confirmed.terms[0].terms
    confirmed.amendments.push({
      id: 'update', at: date.toISOString(), baseVersion: 1, terms, reason: 'Different hours',
      state: 'approved', review: 'Released change',
    })
    const amendment = renderCase(confirmed, true)
    expect(amendment).toMatch(/tab=Amendments[^>]*>Review updated award terms/)
    expect(amendment).not.toContain('Submit milestone evidence')
    confirmed.amendments = []
    const today = new Date().toISOString().slice(0, 10)
    confirmed.deliveries.push({
      id: 'delivery', termsVersion: 1, state: 'accepted', at: date.toISOString(),
      release: 'https://example.test/demo', reproduction: 'https://example.test/tests', note: '',
      review: { note: '', at: addDays(today, -35) + 'T00:00:00.000Z' },
    })
    confirmed.impactPlan = { metrics: [] }
    const due = renderCase(confirmed, true)
    expect(due).toMatch(/tab=Impact&amp;day=30[^>]*>Complete your 30-day update/)
    expect(due).not.toContain('Complete your 90-day update')
    expect(renderCase(confirmed, false)).not.toContain('Complete your 30-day update')
  })

  it('shows the recorded outcome without asking for a note that was not released', () => {
    const closed = applicantProjection({ ...initialState(application), status: 'not_selected' })
    const html = renderCase(closed, false)
    expect(html).toContain('This application was not selected.')
    expect(html).not.toContain('Check the decision note')
  })

  it('surfaces a returned amendment without unlocking delivery or adding a reader write', () => {
    const confirmed = awarded(date.toISOString())
    confirmed.amendments.push({
      id: 'returned', at: date.toISOString(), baseVersion: 1, terms: confirmed.terms[0].terms, reason: 'Different dates',
      state: 'changes_requested', review: 'Please provide a date for the new milestone.',
    })
    const writer = renderCase(confirmed, true)
    const reader = renderCase(confirmed, false)
    expect(writer).toMatch(/What happens next[^]*Please provide a date for the new milestone.[^]*tab=Amendments[^>]*>Revise and resubmit/)
    expect(reader).toMatch(/What happens next[^]*Please provide a date for the new milestone./)
    expect(reader).not.toContain('Revise and resubmit')
    for (const html of [writer, reader]) expect(html).not.toMatch(/No action is needed right now|Submit milestone evidence/)
    expect(renderCase(confirmed, true, 'Amendments')).toContain('data-command="submit_amendment"')
    expect(renderCase(confirmed, false, 'Amendments')).not.toContain('data-command="submit_amendment"')
  })

  it('shows milestone progress and an issued award without an applicant confirmation or transaction link', () => {
    const state = awarded()
    state.milestoneFirst = true
    state.clearedAt = date.toISOString()
    state.deliveries.push({
      id: 'delivery', termsVersion: null, state: 'accepted', at: date.toISOString(),
      release: 'https://example.test/demo', reproduction: 'https://example.test/tests', note: 'Synthetic demo',
      review: { note: 'Verified output', at: date.toISOString() },
    })
    const issued = renderCase(state, true)
    expect(issued).toContain('Award issued')
    expect(issued).toContain('Ship only the code sample')
    expect(issued).not.toMatch(/data-command="confirm_terms"|View transaction/)
    state.payments.push({ id: 'confirmed-private-payment', state: 'confirmed', date: '2026-11-12', amountMinor: 250000 })
    expect(renderCase(state, true)).not.toContain('View transaction')
    expect(renderCase(state, true, 'Decision')).not.toContain('data-command="confirm_terms"')
    state.status = 'submitted'
    state.applicantStatus.status = 'submitted'
    expect(renderCase(state, true)).toContain('Milestone verified')
    state.applicantStatus.status = 'approval_pending'
    state.statusReleases.push({ id: 'original-release', at: date.toISOString(), status: 'approval_pending' })
    expect(renderCase(state, true)).toContain('Approval pending')
    state.applicantStatus.status = 'in_review'
    const recheck = renderCase(state, true)
    expect(recheck).toContain('In review')
    expect(recheck).toContain('Milestone verified')
    expect(recheck).not.toContain('Approval pending')
    expect(renderCase(state, true, 'History')).toContain('Approval pending')
    state.deliveries[0].state = 'submitted'
    const receipt = renderCase(state, true)
    expect(receipt).toMatch(/Evidence submitted[^]*dateTime="2026-11-12T12:00:00.000Z"[^]*Link to what you built[^]*Link showing how it works/i)
    expect(receipt).toContain('Synthetic demo')
    const detail = renderCase(state, true, 'Delivery')
    expect(detail).toMatch(/href="https:\/\/example.test\/demo"[^>]*>Link to what you built<\/a>/)
    expect(detail).toMatch(/href="https:\/\/example.test\/tests"[^>]*>Link showing how it works<\/a>/)
    const legacy = renderCase({ ...state, milestoneFirst: false }, true, 'Delivery')
    expect(legacy).toContain('Release and output')
    expect(legacy).toContain('Reproduction evidence')
    state.deliveries[0].state = 'changes_requested'
    expect(renderCase(state, true)).toContain('data-command="submit_delivery"')
    expect(renderCase(state, true)).toContain('aria-label="Note for the grant team"')
    const resubmit = renderCase(state, true)
    expect(resubmit).toContain('aria-label="Link to what you built"')
    expect(resubmit).toContain('aria-label="Link showing how it works"')
    state.deliveries = []
    const initial = renderCase(state, true)
    expect(initial).toContain('aria-label="Note for the grant team"')
    expect(initial).toContain('aria-label="Link to what you built"')
    expect(initial).toContain('aria-label="Link showing how it works"')
    expect(renderCase(state, false)).not.toContain('data-command="submit_delivery"')
  })

})

function milestoneCase() {
  const short = {
    intakeVersion: 2 as const, summary: 'Build a demo', amountMinor: 500000,
    milestone: { source: 'application' as const, title: 'Publish demo', due: '2026-12-01', evidence: 'Show the demo running' },
  }
  let commandId = 0
  const apply = (state: GrantState, command: Parameters<typeof transition>[1]) =>
    transition(state, command, { now: date.toISOString(), id: String(++commandId), actorId: 'reviewer', projectVersionId: 'version-1', milestoneFirst: true })
  const submitted = apply(initialState(short), { kind: 'submit_application', shortAnswers: short, confirm: true })
  const cleared = apply(submitted, { kind: 'clear_milestone', confirm: true })
  const delivered = apply(cleared, { kind: 'submit_delivery', note: 'Demo ready', release: 'https://example.test/demo', reproduction: 'https://example.test/guide' })
  const verified = apply(delivered, { kind: 'review_delivery', deliveryId: delivered.deliveries[0].id, outcome: 'accepted',
    inspected: true, reproduced: true, matches: true, evidence: 'Checked', note: 'Verified' })
  const assessment = structuredClone(verified.assessment)
  for (const id of criterionIds) assessment.criteria[id] = { score: '2', basis: 'E', source: 'Demo', rationale: 'Verified' }
  for (const id of clearanceIds) assessment.clearances[id] = { state: 'pass', evidence: 'Checked' }
  const ready = apply(verified, { kind: 'save_assessment', assessment })
  return { submitted, delivered, verified, ready, apply }
}

describe('Staff milestone-first award decision', () => {
  it('US-1 shows the verified scope and requested amount beside an explicitly unset award', () => {
    const { ready } = milestoneCase()
    const page = renderStaffCase(ready, true, 'Decision')
    expect(page).toContain('Verified milestone')
    expect(page).toContain('https://example.test/guide')
    expect(page).toContain('$5,000.00')
    expect(page).toContain('Amount to issue')
    expect(page).toContain('Add award details')
    expect(page).not.toContain('Issue award or record outcome')
    expect(page).toMatch(/>Issue award<\/button>/)
  })

  it('US-2 leads with the hold and keeps other outcomes and legacy decisions separate', () => {
    const { verified, ready, apply } = milestoneCase()
    const assessment = renderStaffCase(verified)
    expect(assessment).toMatch(/Assessment required[^]*href="#case-assessment"[^>]*>Go to assessment/)
    expect(assessment).not.toContain('Add award details')
    const open = apply(ready, { kind: 'request_evidence', title: 'Confirm the license', body: 'Link to the license terms.' })
    const hold = renderStaffCase(open)
    expect(hold).toMatch(/Evidence request open[^]*Open requests/)
    expect(hold).toContain('Reject or defer')
    expect(hold).not.toContain('Add award details')
    expect(renderStaffCase(ready, false)).not.toMatch(/>Issue award<|Add award details|Reject or defer/)
    expect(renderStaffCase({ ...initialState(application), status: 'submitted' })).toContain('Record authorised decision')
  })

  it('US-3 renders the issued amount and keeps private decision information off the applicant view', () => {
    const { ready, apply } = milestoneCase()
    const issued = apply(ready, { kind: 'record_decision', outcome: 'approved', ownerId: 'reviewer',
      rationale: 'Internal decision reason', publicNote: 'Shared decision note', budget: 'PRIVATE-BUDGET', authority: 'PRIVATE-APPROVAL',
      terms: { ...application.terms, title: 'Publish demo', acceptance: 'Show the demo running', amountMinor: 180000 } })
    expect(renderStaffCase(issued)).toMatch(/Award issued[^]*\$1,800\.00/)
    const applicant = renderCase(applicantProjection(issued), true)
    expect(applicant).toMatch(/Award receipt[^]*\$1,800\.00[^]*Publish demo/)
    expect(applicant).toContain('Shared decision note')
    expect(applicant).not.toMatch(/PRIVATE-BUDGET|PRIVATE-APPROVAL|Internal decision reason|data-command="confirm_terms"/)
  })
})

describe('Normal v3 staff case entry', () => {
  it('US-4 puts the submitted work, next action and working sections on one page', () => {
    const { submitted, delivered, apply } = milestoneCase()
    const page = renderStaffCase(submitted)
    expect(page).toMatch(/role="tablist"[^>]*aria-label="Case sections"/)
    expect(page.match(/role="tab"/g)).toHaveLength(6)
    expect(page.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(page).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*aria-controls="case-decision"[^>]*>Next action<\/button>/)
    expect(page).toMatch(/role="tabpanel"[^>]*aria-labelledby="trigger-case-decision"[^>]*id="case-decision"/)
    expect(page).toMatch(/role="tabpanel"[^>]*aria-labelledby="trigger-case-application"[^>]*hidden=""[^>]*id="case-application"/)
    expect(page).toMatch(/id="case-decision"[^]*Allow evidence submission[^]*Clear pinned milestone[^]*id="case-application"[^]*Build a demo[^]*href="\/admin\/grants\/applications\/case-1\?tab=Application"[^>]*>Read the full application/)
    expect(page).toContain('Application submitted')
    expect(renderStaffCase(submitted, true, 'Application')).toMatch(/href="\/admin\/grants\/applications\/case-1"[^>]*>Case overview/)
    expect(page).toContain('Recent activity')
    for (const command of ['request_evidence', 'save_assessment', 'clear_milestone']) {
      expect(page.match(new RegExp('data-command="' + command + '"', 'g'))).toHaveLength(1)
    }
    expect(renderStaffCase(delivered, false, undefined, true)).toMatch(/href="#case-evidence"[^>]*>Go to evidence[^]*id="case-evidence"[^]*Record verification/)
    const returned = apply(delivered, { kind: 'review_delivery', deliveryId: delivered.deliveries[0].id, outcome: 'changes_requested',
      inspected: false, reproduced: false, matches: false, evidence: 'Checked', note: 'Please retry.' })
    expect(renderStaffCase(returned)).toContain('Waiting for revised evidence')
    expect(renderStaffCase(submitted, true, 'Decision')).toContain('Milestone verification required')
    const restricted = renderStaffCase(delivered, false)
    expect(restricted).toContain('The milestone verifier must review the submitted evidence.')
    expect(restricted).not.toMatch(/data-command="review_delivery"|data-command="record_decision"/)
  })

  it('US-5 keeps a separate award action and preserves explicit deep links and the legacy entry', () => {
    const { verified, ready } = milestoneCase()
    const page = renderStaffCase(ready)
    expect(page).toContain('id="case-decision"')
    expect(page.match(/>Issue award<\/button>/g)).toHaveLength(1)
    expect(renderStaffCase(verified)).not.toContain('>Issue award</button>')
    const delivery = renderStaffCase(ready, true, 'Delivery')
    expect(delivery).toContain('Verification result')
    expect(delivery).not.toContain('id="case-decision"')
    expect(delivery).not.toContain('role="tablist"')
    expect(renderStaffCase({ ...initialState(application), status: 'submitted' })).toContain('Record authorised decision')
  })
})

it('US-6 names the Committee, separates plan approval and case decisions, and omits authority inputs in v4', () => {
  const planAnswers = {
    intakeVersion: 3 as const, summary: 'Publish a reproducible demo', amountMinor: 500000,
    milestones: [{ source: 'application' as const, title: 'Publish demo', due: '2026-12-01', evidence: 'Show it running' }],
  }
  const submitted = transition(initialState(planAnswers), { kind: 'submit_application', planAnswers, confirm: true }, {
    id: 'plan-1', actorId: 'member-1', projectVersionId: 'version-1', now: date.toISOString(),
  })
  const staff = renderStaffCase(submitted)
  expect(staff).toContain('Approve milestone plan')
  expect(staff).toMatch(/>Hold<[^]*>Decline</)
  expect(staff).toContain('Grants Committee')
  expect(staff).not.toMatch(/Funding route|Approval reference|Budget authorization reference|c1\. Avalanche relevance/)
  expect(renderStaffCase(submitted, false)).not.toMatch(/>Hold<|>Decline<|>Approve milestone plan</)
  expect(renderCase(applicantProjection(submitted), true)).toContain('Grants Committee')
})
