import type { EarnSubmissionStatus } from '@prisma/client'
import { githubReference } from './github'
import type { EarnStageInput } from './schemas'

export type StageGate = Pick<EarnStageInput, 'title' | 'requiresPrevApproval' | 'submissionPolicy'> & {
  id: string
  position: number
}
type StageAttempt = { stageId: string; status: EarnSubmissionStatus }

export function previousStageError(stage: StageGate, stages: StageGate[], entries: StageAttempt[]) {
  if (!stage.requiresPrevApproval) return null
  const approved = new Set(entries.filter((entry) => entry.status === 'approved').map((entry) => entry.stageId))
  const missing = stages.find((earlier) => earlier.position < stage.position && !approved.has(earlier.id))
  return missing ? `Unlocks after approval of “${missing.title}”.` : null
}

export function newSubmissionError(stage: StageGate, isFinal: boolean, entries: StageAttempt[]) {
  if (stage.submissionPolicy === 'multiple') return null
  const attempts = entries.filter((entry) => entry.stageId === stage.id)
  if (!isFinal && attempts.some((entry) => entry.status === 'approved')) return 'This stage is already approved.'
  if (attempts.length) return 'Continue from your existing receipt for this stage.'
  return null
}

export function revisionAllowed(policy: StageGate['submissionPolicy'], status: EarnSubmissionStatus) {
  if (status === 'pending' || status === 'needs_review' || status === 'changes_requested') return true
  return policy === 'resubmit' && (status === 'rejected' || status === 'withdrawn')
}

export function reviewError(status: EarnSubmissionStatus, decision: string, isFinal: boolean, deadline: Date, now: Date) {
  if (status === 'approved' && isFinal && decision === 'needs_review') return null
  if (status !== 'pending' && status !== 'needs_review') return 'This revision already has a decision or has been withdrawn.'
  if (status === 'needs_review' && decision === 'needs_review') return 'This revision is already in review.'
  if (decision === 'changes_requested' && now >= deadline) return 'The submission deadline has passed. Changes are closed.'
  if (decision === 'approved' && isFinal && now < deadline) return 'Select final-stage work after the deadline.'
  return null
}

export function stageEvidenceError(requiresPullRequest: boolean, issueUrl: string | null, pullRequests: string[]) {
  if (!requiresPullRequest) return pullRequests.length ? 'Use work links and notes for this stage.' : null
  const issue = issueUrl ? githubReference(issueUrl, 'issues') : null
  if (!issue || !pullRequests.length) return 'Add a pull request from the bounty issue repository.'
  if (pullRequests.some((url) => githubReference(url, 'pull')?.repository !== issue.repository)) return 'Pull requests must use the bounty issue repository.'
  return null
}

export const submissionLabels = {
  pending: 'In review',
  needs_review: 'In review',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
  approved: 'Approved',
  withdrawn: 'Withdrawn',
} satisfies Record<EarnSubmissionStatus, string>

export function contributorStatus(status: EarnSubmissionStatus, { final, announced, awarded, cancelled }: {
  final: boolean; announced: boolean; awarded: boolean; cancelled: boolean
}) {
  if (status === 'withdrawn') return submissionLabels.withdrawn
  if (cancelled) return 'Bounty cancelled'
  if (awarded) return 'Awarded'
  if (announced && final) return 'Not selected'
  if (announced && (status === 'pending' || status === 'needs_review' || status === 'changes_requested')) return 'Review closed'
  if (final && status === 'approved') return 'In review'
  return submissionLabels[status]
}
