import { describe, expect, it } from 'vitest'
import { bountyDraftSchema, revisionEvidenceSchema, reviewSchema, type EarnStageInput } from '@/app/(site)/earn/_lib/schemas'
import { contributorStatus, newSubmissionError, revisionAllowed, reviewError, stageEvidenceError, type StageGate } from '@/app/(site)/earn/_lib/stage-rules'

const stage: EarnStageInput = {
  title: 'Idea', deliverables: 'Describe the proposal.', requiresPrevApproval: true, requiresPullRequest: false,
  submissionPolicy: 'resubmit', approvalLimit: null,
}
const first: StageGate = { ...stage, id: 'one', position: 1 }
const base = {
  title: 'Education', description: 'Course', deliverables: 'Completed course', participation: 'Submit in the Hub.',
  participationUrl: null, category: 'Development', reward: 'Mentorship', deadline: '2027-01-01T00:00:00Z',
  hubModule: 'Education', githubIssueUrl: 'https://github.com/example/hub/issues/4',
}

describe('native Earn stage rules', () => {
  it('separates one-entry limits, permitted revisions, and multiple final-stage entries', () => {
    const attempts = [{ stageId: first.id, status: 'approved' as const }]
    expect(newSubmissionError(first, false, attempts)).toMatch(/already approved/)
    expect(newSubmissionError({ ...first, submissionPolicy: 'multiple' }, true, attempts)).toBeNull()
    expect(newSubmissionError(first, true, attempts)).toMatch(/existing receipt/)
    expect(revisionAllowed('single', 'pending')).toBe(true)
    expect(revisionAllowed('single', 'rejected')).toBe(false)
    expect(revisionAllowed('resubmit', 'withdrawn')).toBe(true)
    expect(revisionAllowed('resubmit', 'rejected')).toBe(true)
    expect(revisionAllowed('multiple', 'approved')).toBe(false)
  })

  it('preserves late final selection and prevents repeated terminal reviews', () => {
    const before = new Date('2026-11-19T12:00Z')
    const cutoff = new Date('2026-11-19T13:00Z')
    expect(reviewError('needs_review', 'approved', true, cutoff, cutoff)).toBeNull()
    expect(reviewError('pending', 'changes_requested', false, cutoff, cutoff)).toMatch(/Changes are closed/)
    expect(reviewError('approved', 'needs_review', true, cutoff, cutoff)).toBeNull()
    expect(reviewError('approved', 'needs_review', false, cutoff, cutoff)).toMatch(/already has a decision/)
    expect(reviewError('approved', 'approved', false, cutoff, before)).toMatch(/already has a decision/)
    expect(reviewError('needs_review', 'needs_review', false, cutoff, before)).toMatch(/already in review/)
  })

  it('keeps private selections neutral and gives every receipt a terminal result', () => {
    const final = { final: true, announced: false, awarded: false, cancelled: false }
    expect(contributorStatus('approved', final)).toBe('In review')
    expect(contributorStatus('needs_review', { ...final, announced: true })).toBe('Not selected')
    expect(contributorStatus('approved', { ...final, announced: true, awarded: true })).toBe('Awarded')
    expect(contributorStatus('changes_requested', { ...final, final: false, announced: true })).toBe('Review closed')
    expect(contributorStatus('pending', { ...final, cancelled: true })).toBe('Bounty cancelled')
    expect(contributorStatus('withdrawn', { ...final, cancelled: true })).toBe('Withdrawn')
  })

  it('validates stage descriptions, versioned terms, and accepts exactly one PR stage for a native feature', () => {
    const code = { ...stage, requiresPullRequest: true, approvalLimit: 2 }
    const data = { ...base, stages: [stage, code], terms: 'Example terms.' }
    expect(bountyDraftSchema.safeParse(data).success).toBe(true)
    expect(bountyDraftSchema.safeParse({ ...data, stages: [stage, stage] }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...data, stages: [{ ...stage, deliverables: '' }, code] }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...data, stages: Array(21).fill(code) }).success).toBe(false)
  })

  it.each([null, undefined])('US-09 accepts optional additional terms (%s) on a valid native draft', (terms) => {
    const parsed = bountyDraftSchema.safeParse({
      ...base, stages: [{ ...stage, requiresPullRequest: true, approvalLimit: 2 }], terms,
    })
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.data?.terms ?? null).toBeNull()
  })

  it.each([
    { cap: null, valid: false },
    { cap: 0, valid: false },
    { cap: 2, valid: true },
  ])('US-26 validates a new final stage with cap $cap', ({ cap, valid }) => {
    const parsed = bountyDraftSchema.safeParse({
      ...base,
      terms: 'Synthetic additional terms',
      stages: [{ ...stage, requiresPullRequest: true, approvalLimit: cap }],
    })
    if (valid) expect(parsed.data?.stages?.[0]?.approvalLimit).toBe(cap)
    else expect(parsed.error?.issues.map((issue) => issue.path) ?? []).toContainEqual(['stages', 0, 'approvalLimit'])
  })

  it('validates evidence without throwing and binds a feature PR to the linked repository', () => {
    const evidence = { notes: '', links: ['malformed'], pullRequests: [], accepted: true, termsVersion: 1 }
    expect(revisionEvidenceSchema.safeParse(evidence).success).toBe(false)
    expect(revisionEvidenceSchema.safeParse({ ...evidence, links: [], notes: 'Work evidence', accepted: false }).success).toBe(false)
    expect(stageEvidenceError(true, base.githubIssueUrl, ['https://github.com/example/other/pull/1'])).toMatch(/repository/)
    expect(stageEvidenceError(true, base.githubIssueUrl, ['https://github.com/example/hub/pull/1'])).toBeNull()
  })

  it('reports duplicate normalized evidence under the field that supplied it', () => {
    const link = 'https://example.com/work'
    const pull = 'https://github.com/example/hub/pull/1'
    const result = revisionEvidenceSchema.safeParse({
      notes: '', links: [link, link], pullRequests: [pull, pull + '/'], accepted: true, termsVersion: 1,
    })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['links'], ['pullRequests']])
  })

  it('requires contributor feedback for a rejection or change request', () => {
    const ref = { id: '83a2f90c-8226-400c-8df0-19fe4827db49', bountyId: '17f149fa-6932-4c27-85f5-096379ba4db6', version: 1 }
    expect(reviewSchema.safeParse({ ...ref, decision: 'rejected', internalNote: 'Private reason', feedback: '' }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...ref, decision: 'changes_requested', internalNote: '', feedback: 'Explain the setup.' }).success).toBe(true)
  })
})
