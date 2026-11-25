'use server'

import { revalidatePath } from 'next/cache'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { findVerifiedBuilder } from '@/lib/builder-lookup'
import { prisma } from '@/lib/db'
import { parseInviteTarget } from '@/lib/project-team'
import { planTeamCorrection, type SubmittedMember } from '@/lib/submission-team'
import { assertManage } from './manage'
import { teamCorrectionSchema } from './schemas'

export const correctSubmissionTeam = action({
  schema: teamCorrectionSchema,
  permission: 'user',
}, async ({ hackathonId, entryId, addTarget, removeUserId, reason }, user) => {
  const h = await assertManage(hackathonId, user)
  const added = addTarget ? await findVerifiedBuilder(parseInviteTarget(addTarget)!) : null
  if (addTarget && !added) throw new ActionError('Use the email or handle of one verified, registered builder')
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${hackathonId}))`
    const entry = await tx.stageEntry.findFirst({
      where: { id: entryId, submission: { hackathonId } },
      include: { submission: { select: { id: true, status: true } }, assignments: { select: { judge: { select: { userId: true } } } } },
    })
    if (!entry) throw new ForbiddenError('Unknown submission entry')
    if (entry.submission.status !== 'active') throw new ActionError('Only active submissions can have their team corrected')
    const [registration, others] = await Promise.all([
      added ? tx.participant.findUnique({ where: { hackathonId_userId: { hackathonId, userId: added.id } }, select: { status: true } }) : null,
      h.allowMultipleSubmissions ? [] : tx.submission.findMany({
        where: { hackathonId, status: 'active', id: { not: entry.submission.id } },
        select: { project: { select: { members: { where: { role: { in: ['owner', 'writer'] } }, select: { userId: true } } } }, entries: { select: { teamSnapshot: true } } },
      }),
    ])
    const before = entry.teamSnapshot as SubmittedMember[]
    const plan = planTeamCorrection(before, { add: added ? { userId: added.id, name: added.name } : null, removeUserId }, {
      teamSizeMin: h.teamSizeMin,
      teamSizeMax: h.teamSizeMax,
      allowMultipleSubmissions: h.allowMultipleSubmissions,
      activeParticipants: new Set(added && registration?.status === 'active' ? [added.id] : []),
      reviewerUserIds: new Set(entry.assignments.flatMap((a) => a.judge.userId ? [a.judge.userId] : [])),
      otherSubmissionUsers: new Set(others.flatMap((s) => [...s.project.members.map((m) => m.userId), ...s.entries.flatMap((e) => (e.teamSnapshot as SubmittedMember[]).map((m) => m.userId))])),
    })
    if (!plan.ok) throw new ActionError(plan.reason)
    await tx.stageEntry.update({ where: { id: entryId }, data: { teamSnapshot: plan.team } })
    await tx.submissionTeamChange.create({ data: { entryId, actorId: user.id, actorName: user.name, reason, beforeTeam: before, afterTeam: plan.team } })
    return { before, after: plan.team }
  })
  await recordAudit({ actorId: user.id, action: 'hackathon.submission.team.correct', entityType: 'StageEntry', entityId: entryId, before: { teamUserIds: result.before.map((m) => m.userId) }, after: { teamUserIds: result.after.map((m) => m.userId) } })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
  revalidatePath('/projects', 'layout')
  revalidatePath('/judge', 'layout')
  return null
})
