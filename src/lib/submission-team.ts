import type { Prisma } from '@prisma/client'

export type SubmittedMember = { userId: string; name: string }

/** Project teams and corrected submission snapshots both occupy a team slot. */
export function submissionTeamWhere(userIds: string[], teamRoles: string[]): Prisma.SubmissionWhereInput {
  return { OR: [
    { project: { members: { some: { userId: { in: userIds }, role: { in: teamRoles } } } } },
    { entries: { some: { OR: userIds.map((userId) => ({ teamSnapshot: { array_contains: [{ userId }] } })) } } },
  ] }
}

type CorrectionContext = { teamSizeMin: number; teamSizeMax: number | null; activeParticipants: ReadonlySet<string>; otherSubmissionUsers: ReadonlySet<string>; reviewerUserIds: ReadonlySet<string>; allowMultipleSubmissions: boolean }
export function planTeamCorrection(current: SubmittedMember[], change: { add: SubmittedMember | null; removeUserId: string | null }, ctx: CorrectionContext): { ok: true; team: SubmittedMember[] } | { ok: false; reason: string } {
  if (change.removeUserId && !current.some((m) => m.userId === change.removeUserId)) return { ok: false, reason: 'That member is not on the submitted team' }
  const team = current.filter((m) => m.userId !== change.removeUserId)
  if (change.add) {
    if (team.some((m) => m.userId === change.add!.userId)) return { ok: false, reason: 'That builder is already on the submitted team' }
    if (!ctx.activeParticipants.has(change.add.userId)) return { ok: false, reason: 'The added builder must register for this hackathon first' }
    if (ctx.reviewerUserIds.has(change.add.userId)) return { ok: false, reason: 'That builder is an assigned judge for this submission. Resolve the conflict first.' }
    team.push({ ...change.add })
  }
  if (team.length < ctx.teamSizeMin) return { ok: false, reason: `The submitted team needs at least ${ctx.teamSizeMin} members` }
  if (ctx.teamSizeMax != null && team.length > ctx.teamSizeMax) return { ok: false, reason: `The submitted team can have at most ${ctx.teamSizeMax} members` }
  if (!ctx.allowMultipleSubmissions && team.some((m) => ctx.otherSubmissionUsers.has(m.userId))) return { ok: false, reason: 'A member is already on another submission in this hackathon' }
  return { ok: true, team }
}
