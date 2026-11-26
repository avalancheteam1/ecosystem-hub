import 'server-only'
import type { Prisma } from '@prisma/client'
import { committeeApprovalRules, defaultCommitteeApprovalRule, defaultCommitteeSize, validCommitteeSize } from './committee-policy'

type CommitteeDb = Pick<Prisma.TransactionClient, 'grantCommitteeSettings' | 'grantCommitteeSeat' | 'user'>
type PinnedCommittee = { actorId: string; reviewerIds: readonly string[] }

export function committeeRoster() {
  const shortlisterId = committeeShortlisterId()
  const memberIds = process.env.GRANTS_COMMITTEE_MEMBER_IDS?.split(',').map((id) => id.trim())
  if (!shortlisterId || !memberIds || !validCommitteeSize(memberIds.length) ||
    memberIds.some((id) => !id || id === shortlisterId) || new Set(memberIds).size !== memberIds.length) return null

  return { shortlisterId, memberIds }
}

export function committeeShortlisterId() {
  return process.env.GRANTS_SHORTLISTER_ID?.trim() || null
}

export const committeeReviewerAccess = {
  OR: [
    { isSuperAdmin: true },
    { permissions: { some: { permission: 'grants.review' } } },
    { roles: { some: { role: { permissions: { has: 'grants.review' } } } } },
  ],
} satisfies Prisma.UserWhereInput

export async function readManagedCommitteeSettings(db: Pick<CommitteeDb, 'grantCommitteeSettings'>) {
  const settings = await db.grantCommitteeSettings.findUnique({ where: { id: 1 } })
  const approvalRule = committeeApprovalRules.find((rule) => rule === settings?.approvalRule) ?? defaultCommitteeApprovalRule
  return { seatCount: settings?.seatCount ?? defaultCommitteeSize, revision: settings?.revision ?? 0, approvalRule }
}

export async function readCommitteeRoster(db: CommitteeDb, managed: boolean, pinned?: PinnedCommittee) {
  if (!managed) {
    const roster = committeeRoster()
    if (!roster) return null
    if (pinned && (pinned.actorId !== roster.shortlisterId || !pinned.reviewerIds.every((id) => roster.memberIds.includes(id))))
      return null
    return { ...roster, memberIds: pinned ? [...pinned.reviewerIds] : roster.memberIds, managed: undefined, approvalRule: undefined }
  }

  const shortlisterId = committeeShortlisterId()
  if (!shortlisterId) return null
  if (pinned) {
    if (pinned.actorId !== shortlisterId) return null
    // Administrative changes to the future roster do not replace any assigned voter.
    const memberIds = [...pinned.reviewerIds]
    const eligible = await db.user.count({ where: { id: { in: memberIds }, ...committeeReviewerAccess } })
    return eligible === memberIds.length ? { shortlisterId, memberIds, managed: true as const, approvalRule: undefined } : null
  }

  const [settings, seats] = await Promise.all([
    readManagedCommitteeSettings(db),
    db.grantCommitteeSeat.findMany({
      where: { user: { is: committeeReviewerAccess } },
      orderBy: { slot: 'asc' },
      select: { userId: true },
    }),
  ])
  const memberIds = seats.flatMap(({ userId }) => userId ? [userId] : [])
  if (memberIds.length !== settings.seatCount || memberIds.includes(shortlisterId)) return null
  return { shortlisterId, memberIds, managed: true as const, approvalRule: settings.approvalRule }
}
