import { describe, expect, it } from 'vitest'
import { bountyDraftSchema, revisionEvidenceSchema, reviewSchema, type EarnStageInput } from '@/app/(site)/earn/_lib/schemas'
import { contributorStatus, newSubmissionError, previousStageError, revisionAllowed, reviewError, stageEvidenceError, type StageGate } from '@/app/(site)/earn/_lib/stage-rules'

const stage: EarnStageInput = {
  title: 'Idea', deliverables: 'Describe the proposal.', requiresPrevApproval: true, requiresPullRequest: false,
  submissionPolicy: 'resubmit', approvalLimit: null,
}
const first: StageGate = { ...stage, id: 'one', position: 1 }
const second: StageGate = { ...stage, title: 'Outline', id: 'two', position: 2 }
const last: StageGate = { ...stage, title: 'Course', id: 'three', position: 3 }
const stages = [first, second, last]
const base = {
  title: 'Education', description: 'Course', deliverables: 'Completed course', participation: 'Submit in the Hub.',
  participationUrl: null, category: 'Development', reward: 'Mentorship', deadline: '2027-01-01T00:00:00Z',
  hubModule: 'Education', githubIssueUrl: 'https://github.com/example/hub/issues/4',
}

describe('native Earn stage rules', () => {
  it('requires every earlier approval unless the selected stage accepts parallel work', () => {
    const attempts = [{ stageId: second.id, status: 'approved' as const }]
    expect(previousStageError(last, stages, attempts)).toMatch(/Idea/)
    expect(previousStageError(last, stages, [...attempts, { stageId: first.id, status: 'approved' }])).toBeNull()
    expect(previousStageError({ ...last, requiresPrevApproval: false }, stages, [])).toBeNull()
  })

  it('separates one-entry limits, permitted revisions, and multiple final-stage entries', () => {
    const attempts = [{ stageId: first.id, status: 'approved' as const }]
    expect(newSubmissionError({ ...first, submissionPolicy: 'multiple' }, false, attempts)).toMatch(/already approved/)
    expect(newSubmissionError({ ...first, submissionPolicy: 'multiple' }, true, attempts)).toBeNull()
    expect(newSubmissionError(first, true, attempts)).toMatch(/existing receipt/)
    expect(revisionAllowed('single', 'pending')).toBe(true)
    expect(revisionAllowed('single', 'rejected')).toBe(false)
    expect(revisionAllowed('resubmit', 'withdrawn')).toBe(true)
    expect(revisionAllowed('resubmit', 'rejected')).toBe(true)
    expect(revisionAllowed('multiple', 'approved')).toBe(false)
  })

  it('locks final selection to the cutoff and prevents repeated terminal reviews', () => {
    const before = new Date('2026-11-19T12:00Z')
    const cutoff = new Date('2026-11-19T13:00Z')
    expect(reviewError('pending', 'approved', true, cutoff, before)).toMatch(/after the deadline/)
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
    const code = { ...stage, requiresPullRequest: true }
    const data = { ...base, stages: [stage, code], terms: 'Example terms.' }
    expect(bountyDraftSchema.safeParse(data).success).toBe(true)
    expect(bountyDraftSchema.safeParse({ ...data, stages: [stage, stage] }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...data, terms: null }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...data, stages: [{ ...stage, deliverables: '' }, code] }).success).toBe(false)
    expect(bountyDraftSchema.safeParse({ ...data, stages: Array(21).fill(code) }).success).toBe(false)
  })

  it('validates evidence without throwing and binds a feature PR to the linked repository', () => {
    const evidence = { notes: '', links: ['malformed'], pullRequests: [], accepted: true, termsVersion: 1 }
    expect(revisionEvidenceSchema.safeParse(evidence).success).toBe(false)
    expect(revisionEvidenceSchema.safeParse({ ...evidence, links: [], notes: 'Work evidence', accepted: false }).success).toBe(false)
    expect(stageEvidenceError(true, base.githubIssueUrl, ['https://github.com/example/other/pull/1'])).toMatch(/repository/)
    expect(stageEvidenceError(true, base.githubIssueUrl, ['https://github.com/example/hub/pull/1'])).toBeNull()
  })

  it('requires contributor feedback for a rejection or change request', () => {
    const ref = { id: '83a2f90c-8226-400c-8df0-19fe4827db49', bountyId: '17f149fa-6932-4c27-85f5-096379ba4db6', version: 1 }
    expect(reviewSchema.safeParse({ ...ref, decision: 'rejected', internalNote: 'Private reason', feedback: '' }).success).toBe(false)
    expect(reviewSchema.safeParse({ ...ref, decision: 'changes_requested', internalNote: '', feedback: 'Explain the setup.' }).success).toBe(true)
  })
})
