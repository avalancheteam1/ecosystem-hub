export const defaultCommitteeSize = 4
export const maxCommitteeSize = 32

export function validCommitteeSize(size: number) {
  return Number.isInteger(size) && size >= 1 && size <= maxCommitteeSize
}

export const committeeApprovalRules = ['unanimity', 'absolute_majority', 'simple_majority'] as const
export type CommitteeApprovalRule = typeof committeeApprovalRules[number]
export const defaultCommitteeApprovalRule: CommitteeApprovalRule = 'unanimity'

export const committeeApprovalLabel: Record<CommitteeApprovalRule, string> = {
  unanimity: 'Unanimity',
  absolute_majority: 'Absolute majority',
  simple_majority: 'Simple majority',
}

export const committeeApprovalDescription: Record<CommitteeApprovalRule, string> = {
  unanimity: 'Every assigned reviewer must approve.',
  absolute_majority: 'More than half of all assigned seats must approve.',
  simple_majority: 'Everyone must vote or abstain. Approvals must outnumber votes against.',
}

export function committeeVoteResult(
  shortlist: { reviewerIds: readonly string[]; approvalRule?: CommitteeApprovalRule },
  request: { votes: readonly { actorId: string; vote: 'approve' | 'oppose' | 'abstain' }[] },
) {
  const voteByReviewer = new Map(request.votes.map(({ actorId, vote }) => [actorId, vote]))
  const votes = shortlist.reviewerIds.map((id) => voteByReviewer.get(id))
  const total = votes.length
  const approved = votes.filter((vote) => vote === 'approve').length
  const opposed = votes.filter((vote) => vote === 'oppose').length
  const abstained = votes.filter((vote) => vote === 'abstain').length
  const outstanding = total - approved - opposed - abstained
  const majority = Math.floor(total / 2) + 1
  const rule = shortlist.approvalRule ?? defaultCommitteeApprovalRule
  const passed = total > 0 && (rule === 'unanimity' ? approved === total
    : rule === 'absolute_majority' ? approved >= majority
      : outstanding === 0 && approved > opposed)
  return { total, approved, opposed, abstained, outstanding, majority, rule, passed }
}
