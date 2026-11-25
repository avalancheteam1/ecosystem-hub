import { formatEventRange } from '@/lib/dates'

/** Submission state belongs to the hackathon entry, never to project creation or sealing. */
export function submissionBanner(status: string | null, submittedAt: Date | null, timeZone = 'UTC'): string {
  if (status === 'withdrawn') return 'Withdrawn, not submitted'
  if (status === 'disqualified') return 'Disqualified'
  return status === 'active' && submittedAt ? `Submitted on ${formatEventRange(submittedAt, null, timeZone)}` : 'Draft, not submitted'
}

export type SubmissionConfirmation = { versionId: string; updatedAt: string; teamUserIds: string[] }
export function matchesSubmissionConfirmation(current: { id: string; updatedAt: Date }, teamUserIds: string[], confirmation: SubmissionConfirmation): boolean {
  return current.id === confirmation.versionId && current.updatedAt.toISOString() === confirmation.updatedAt && JSON.stringify([...teamUserIds].sort()) === JSON.stringify([...new Set(confirmation.teamUserIds)].sort())
}
