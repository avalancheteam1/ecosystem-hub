import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { GrantCaseView } from '@/app/(site)/grants/_components/case-view'
import { applicantProjection, initialState, transition } from '@/app/(site)/grants/_lib/rules'

vi.mock('@/app/(site)/grants/_components/command-form', () => ({
  GrantCommandForm: ({ label, data }: { label: string; data: { kind: string; requestId?: string } }) =>
    createElement('button', { 'data-command': data.kind, 'data-request': data.requestId }, label),
}))
vi.mock('@/app/(site)/grants/_components/short-grant-form', () => ({ ShortGrantForm: () => null }))
vi.mock('@/app/(site)/grants/_lib/config', () => ({ shortIntakeEnabled: () => false }))
vi.mock('@/app/(site)/grants/_lib/actions', () => ({ changeApplication: vi.fn() }))
vi.mock('@/components/data-table', () => ({ DataTable: () => null }))
vi.mock('@/hooks/use-action-toast', () => ({ useActionToast: () => ({ pending: false }) }))

type Case = Parameters<typeof GrantCaseView>[0]['data']
const date = '2026-11-26T10:00:00.000Z'
const plan = {
  intakeVersion: 3 as const, amountMinor: 480000, summary: 'Fund the replay feature',
  milestones: [
    { source: 'application' as const, title: 'Publish replay sample', due: '2026-12-01', evidence: 'Replay recording' },
    { source: 'application' as const, title: 'Publish test cases', due: '2026-12-02', evidence: 'Passing tests' },
  ],
}
const reviewers = ['private-reviewer-a', 'private-reviewer-b', 'private-reviewer-c', 'private-reviewer-d']
const shortlister = 'private-shortlister'
const submitted = transition(initialState(plan), { kind: 'submit_application', confirm: true, planAnswers: plan }, {
  id: 'plan-1', actorId: 'editor', now: date, projectVersionId: 'version-1',
})
if (submitted.version !== 4) throw new Error('Expected a v4 application')
const pinned = submitted.applications[0]
const earlierRequest = {
  id: 'request-v1', planId: pinned.id, at: date, actorId: shortlister, totalMinor: 400000,
  milestoneAmounts: pinned.answers.milestones.map(({ milestoneId }) => ({ milestoneId, amountMinor: 200000 })),
  reason: 'Reduce each allocation', response: { actorId: 'editor', at: date, outcome: 'accepted' as const },
  votes: reviewers.map((actorId) => ({ actorId, at: date, vote: 'approve' as const, note: 'Private review note' })),
}
const currentRequest = {
  ...earlierRequest, id: 'request-v2', totalMinor: 300050,
  milestoneAmounts: pinned.answers.milestones.map(({ milestoneId }, i) => ({ milestoneId, amountMinor: i ? 0 : 300050 })),
  reason: 'Focus the allocation on the replay sample', response: undefined, votes: [],
}
const shortlist = { actorId: shortlister, at: date, planId: pinned.id, reviewerIds: reviewers }
const common = {
  id: 'case-1', revision: 8, name: 'Synthetic grant case', round: 'Mini Grants', roundOpen: true, continuous: true,
  projectId: 'project-1', projectVersionId: 'version-1', projectSlug: 'synthetic', userId: 'editor',
  milestones: [], demoProofMissing: false,
  projectVersion: {
    id: 'version-1', projectId: 'project-1', name: 'Synthetic grant case', number: 1,
    shortDescription: '', fullDescription: '', techDescription: '', techStack: [], categories: [],
    maturity: 'prototype', launchDate: null, country: null, otherCategory: null,
    githubRepos: [], demoLinks: [], videoUrl: null, logoUrl: null, coverUrl: null, screenshots: [],
    deployedAddresses: [], websiteUrl: null, websites: [], socials: [], note: null, createdById: null,
    createdAt: new Date(date), sealedAt: new Date(date), updatedAt: new Date(date),
  },
}
const workflow = { required: true, configured: true, canShortlist: false, canPropose: true, canVote: true, canDecide: true }
const capabilities = { review: true, decide: true, verify: false, payments: false, manage: false }
const render = (data: Case, requestedTab?: string) =>
  renderToStaticMarkup(createElement(GrantCaseView, { data, requestedTab }))

describe('Award amount requests in the grant case', () => {
  it('allows shortlisting in staff Next action without opening applicant-visible status', () => {
    const data = { ...common, staff: true as const, state: submitted, writer: false, owners: [], capabilities }
    const staff = render({ ...data, committeeWorkflow: { ...workflow, canShortlist: true, canPropose: false, canVote: false, canDecide: false } })
    expect(staff).toMatch(/id="case-decision"[^]*data-command="shortlist_application"/)
    expect(staff).not.toMatch(/data-command="clear_milestone"|data-command="hold_application"|data-command="decline_application"/)
    const applicant = render({ ...common, staff: false, state: applicantProjection({ ...submitted, committeeReview: { shortlist, requests: [] } }), draftProject: null, writer: true })
    expect(applicant).not.toMatch(/Shortlisted|private-shortlister/)
  })

  it('shows new and prior proposals in Requests and binds the ballot to the current accepted request', () => {
    const state = {
      ...submitted,
      planApproval: { id: 'approved-plan', actorId: 'private-reviewer-a', at: date, planId: pinned.id, projectVersionId: 'version-1' },
      deliveries: pinned.answers.milestones.map(({ milestoneId }, i) => ({
        id: `evidence-${i}`, actorId: 'editor', at: date, planId: pinned.id, milestoneId, termsVersion: null,
        release: 'https://example.test/demo', reproduction: 'https://example.test/run', note: 'Replay evidence',
        state: 'accepted' as const, review: { verifierId: 'private-reviewer-a', at: date, note: 'Verified', evidence: 'Checked' },
      })),
      committeeReview: { shortlist, requests: [earlierRequest, { ...currentRequest, response: earlierRequest.response, votes: [
        earlierRequest.votes[0],
        { ...earlierRequest.votes[0], vote: 'oppose' as const },
      ] }] },
    }
    const data = { ...common, staff: true as const, state, committeeWorkflow: workflow, writer: false, owners: [], capabilities }
    const staff = render(data, 'Requests')
    expect(staff).toMatch(/Award amount proposal v2[^]*0 of 4 approvals/)
    expect(staff).toContain('1 opposed')
    expect(staff).toMatch(/Award amount proposal v1[^]*4 of 4 approvals/)
    expect(staff.match(/data-command="vote_award"/g)).toHaveLength(1)
    expect(staff).toContain('data-request="request-v2"')
    expect(staff).toContain('data-command="request_award_amount"')
    expect(render({ ...data, state: { ...state, deliveries: [] } }, 'Requests')).not.toContain('data-command="vote_award"')
    expect(render({ ...data, committeeWorkflow: { ...workflow, configured: false, canVote: false } }, 'Requests'))
      .not.toContain('data-command="vote_award"')
  })

  it('shows the applicant comparison and a writer-only response to the latest pending proposal', () => {
    const state = applicantProjection({ ...submitted, committeeReview: { shortlist, requests: [earlierRequest, currentRequest] } })
    const data = { ...common, staff: false as const, state, draftProject: null, writer: true }
    const overview = render(data)
    expect(overview).toMatch(/href="[^"]+\?tab=Requests"[^>]*>Review proposed award amount/)
    expect(overview).not.toContain('No action is needed right now.')
    const requests = render(data, 'Requests')
    expect(requests).toMatch(/Original request[^]*\$4,800\.00[^]*Proposed total[^]*\$3,000\.50/)
    expect(requests).toMatch(/Publish replay sample[^]*\$3,000\.50[^]*Publish test cases[^]*\$0\.00/)
    expect(requests).toContain('data-command="respond_award_amount" data-request="request-v2"')
    expect(requests).not.toMatch(/private-reviewer|private-shortlister|Private review note|of 4 approvals|Reduce each allocation/)
    expect(render({ ...data, writer: false }, 'Requests')).not.toContain('data-command="respond_award_amount"')
  })

  it.each(['accepted', 'declined'] as const)('keeps the %s response in Requests and removes the response action', (outcome) => {
    const request = { ...currentRequest, response: { ...earlierRequest.response, outcome } }
    const clarification = { id: 'question', actorId: shortlister, at: date, title: 'Confirm the demo',
      body: 'Which environment runs the replay?', reply: '', answeredAt: null }
    const state = applicantProjection({
      ...submitted, committeeReview: { shortlist, requests: [request] }, requests: [clarification],
    })
    const data = { ...common, staff: false as const, state, draftProject: null, writer: true }
    const requests = render(data, 'Requests')
    expect(requests).toContain(outcome === 'accepted' ? 'Accepted by applicant' : 'Declined by applicant')
    expect(requests).not.toContain('data-command="respond_award_amount"')
    expect(requests).toMatch(/Clarification requests[^]*Confirm the demo[^]*data-command="answer_request"/)
    expect(render(data)).not.toContain('Review proposed award amount')
  })
})
