'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { assignRandom, isConflicted, judgeEligibility, weightedTotal, type Pair } from './judging'
import { assertManage } from './manage'
import { prizePlaces, stageState } from './rules'

const id = z.string().min(1)
const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

async function loadStage(stageId: string) {
  const stage = await prisma.hackathonStage.findUnique({
    where: { id: stageId },
    include: {
      entries: { where: { submission: { status: 'active' } }, include: { submission: { include: { project: { include: { members: { select: { userId: true } } } } } } } },
      hackathon: { include: { judges: true, stages: { orderBy: { order: 'asc' }, select: { id: true, order: true } } } },
    },
  })
  if (!stage) throw new ActionError('Stage not found')
  return stage
}

type LoadedStage = Awaited<ReturnType<typeof loadStage>>

/** A random, balanced draw with the stage's "judges per submission" ("all judges" stages assign themselves, see queries.ts). */
async function computePairs(stage: LoadedStage, seed: string) {
  const perEntry = stage.judgesPerSubmission
  if (stage.reviewMode !== 'random' || !perEntry) throw new ActionError('This stage assigns every judge automatically - switch it to random judges under Stages to draw')
  const entries = stage.entries.map((e) => ({
    id: e.id,
    trackIds: e.submission.trackIds,
    teamUserIds: [...(e.teamSnapshot as { userId: string }[]).map((m) => m.userId), ...e.submission.project.members.map((m) => m.userId)],
  }))
  const judges = stage.hackathon.judges.map((j) => ({ id: j.id, userId: j.userId, trackIds: j.trackIds }))
  if (!judges.length) throw new ActionError('Invite judges first')
  if (!entries.length) throw new ActionError('No submissions in this stage yet')
  const done = await prisma.judgeAssignment.findMany({ where: { entry: { stageId: stage.id }, review: { submittedAt: { not: null } } }, select: { judgeId: true, entryId: true, review: { select: { conflictDeclared: true } } } })
  // Real reviews stay and count toward n; declared conflicts stay recorded but are never drawn again and don't count.
  const keep: Pair[] = done.filter((r) => !r.review?.conflictDeclared).map((r) => [r.judgeId, r.entryId])
  const exclude: Pair[] = done.filter((r) => r.review?.conflictDeclared).map((r) => [r.judgeId, r.entryId])
  const r = assignRandom(entries, judges, perEntry, { seed, keep, exclude })
  if (!r.ok) {
    const names = stage.entries.filter((e) => r.infeasible.includes(e.id)).length
    throw new ActionError(`${names} submission(s) can't get ${perEntry} eligible judges (conflicts or track limits). Invite more judges or lower the number.`)
  }
  return { pairs: r.pairs, keep }
}

/** Preview a draw without writing anything. */
export const previewAssignment = action({ schema: z.object({ hackathonId: id, stageId: id, seed: z.string().max(40).optional() }), permission: 'user' }, async ({ hackathonId, stageId, seed }, user) => {
  await assertManage(hackathonId, user)
  const stage = await loadStage(stageId)
  if (stage.hackathonId !== hackathonId) throw new ActionError('Stage not found')
  const s = seed ?? crypto.randomBytes(6).toString('hex')
  const { pairs } = await computePairs(stage, s)
  const load = stage.hackathon.judges.map((j) => ({ judge: j.email, count: pairs.filter(([jid]) => jid === j.id).length }))
  return { seed: s, total: pairs.length, load }
})

/** Apply a (previewed) draw: keeps reviewed assignments, replaces the rest. */
export const applyAssignment = action({ schema: z.object({ hackathonId: id, stageId: id, seed: z.string().min(1).max(40) }), permission: 'user' }, async ({ hackathonId, stageId, seed }, user) => {
  const h = await assertManage(hackathonId, user)
  const stage = await loadStage(stageId)
  if (stage.hackathonId !== hackathonId) throw new ActionError('Stage not found')
  if (stageState(stage, new Date()) === 'closed') throw new ActionError('Judging is closed for this stage')
  const { pairs, keep } = await computePairs(stage, seed)
  const keepSet = new Set(keep.map(([j, e]) => `${j}:${e}`))
  const added = await prisma.$transaction(async (tx) => {
    await tx.judgeAssignment.deleteMany({ where: { entry: { stageId }, OR: [{ review: null }, { review: { submittedAt: null } }] } })
    const fresh = pairs.filter(([j, e]) => !keepSet.has(`${j}:${e}`))
    await tx.judgeAssignment.createMany({ data: fresh.map(([judgeId, entryId]) => ({ judgeId, entryId, createdById: user.id })), skipDuplicates: true })
    return fresh.length
  })
  await recordAudit({ actorId: user.id, action: 'hackathon.judging.assign', entityType: 'HackathonStage', entityId: stageId, after: { seed, perEntry: stage.judgesPerSubmission, assignments: pairs.length } })
  // Tell judges they have work (one mail per judge with new assignments).
  const judgeIds = new Set(pairs.filter(([j, e]) => !keepSet.has(`${j}:${e}`)).map(([j]) => j))
  for (const j of stage.hackathon.judges.filter((x) => judgeIds.has(x.id))) {
    await sendMail({
      to: j.email,
      subject: `Submissions are ready for you to judge - ${h.event.name}`,
      text: `You have submissions to review for "${h.event.name}" (${stage.name}).\n\n${siteUrl()}/judge`,
      html: brandedShell({ preheader: `Submissions to review for ${h.event.name}`, body: `<tr><td class="m-px" style="${CELL}"><p style="${PARA}">You have submissions to review for <strong>${esc(h.event.name)}</strong> (${esc(stage.name)}).</p>${button(`${siteUrl()}/judge`, 'Start judging')}</td></tr>` }),
    }).catch((err) => console.error('[judging] mail failed', err))
  }
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  return { assigned: pairs.length, added }
})

/** Load an entry of a hackathon with what eligibility needs. */
async function loadEntry(hackathonId: string, entryId: string) {
  const e = await prisma.stageEntry.findFirst({
    where: { id: entryId, stage: { hackathonId }, submission: { status: 'active' } },
    include: { stage: true, submission: { include: { project: { include: { members: { select: { userId: true } } } } } }, assignments: { include: { review: { select: { conflictDeclared: true, submittedAt: true } } } } },
  })
  if (!e) throw new ActionError('Submission not found')
  if (e.stage.judgingClosedAt) throw new ActionError('Judging is closed for this stage')
  const declared: Pair[] = e.assignments.filter((a) => a.review?.conflictDeclared).map((a) => [a.judgeId, a.entryId])
  const forRules = { id: e.id, trackIds: e.submission.trackIds, teamUserIds: [...(e.teamSnapshot as { userId: string }[]).map((m) => m.userId), ...e.submission.project.members.map((m) => m.userId)] }
  return { e, declared, forRules }
}

/** Manually assign one judge to one submission (eligibility enforced). */
export const assignJudge = action({ schema: z.object({ hackathonId: id, entryId: id, judgeId: id }), permission: 'user' }, async ({ hackathonId, entryId, judgeId }, user) => {
  await assertManage(hackathonId, user)
  const { e, declared, forRules } = await loadEntry(hackathonId, entryId)
  const judge = await prisma.hackathonJudge.findFirst({ where: { id: judgeId, hackathonId } })
  if (!judge) throw new ActionError('Judge not found')
  const ok = judgeEligibility(judge, forRules, declared)
  if (!ok.ok) throw new ActionError(`Can't assign: ${ok.reason.toLowerCase()}`)
  await prisma.judgeAssignment.upsert({ where: { judgeId_entryId: { judgeId, entryId } }, create: { judgeId, entryId, createdById: user.id }, update: {} })
  await recordAudit({ actorId: user.id, action: 'hackathon.judging.assign.manual', entityType: 'StageEntry', entityId: e.id, after: { judgeId } })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  return null
})

/** Assign every eligible judge to one submission. */
export const assignAllToEntry = action({ schema: z.object({ hackathonId: id, entryId: id }), permission: 'user' }, async ({ hackathonId, entryId }, user) => {
  await assertManage(hackathonId, user)
  const { e, declared, forRules } = await loadEntry(hackathonId, entryId)
  const judges = await prisma.hackathonJudge.findMany({ where: { hackathonId } })
  const ids = judges.filter((j) => judgeEligibility(j, forRules, declared).ok).map((j) => j.id)
  await prisma.judgeAssignment.createMany({ data: ids.map((judgeId) => ({ judgeId, entryId, createdById: user.id })), skipDuplicates: true })
  await recordAudit({ actorId: user.id, action: 'hackathon.judging.assign.all', entityType: 'StageEntry', entityId: e.id, after: { judges: ids.length } })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  return { count: ids.length }
})

/** Remove an assignment - only while no review was submitted on it. */
export const unassignJudge = action({ schema: z.object({ hackathonId: id, assignmentId: id }), permission: 'user' }, async ({ hackathonId, assignmentId }, user) => {
  await assertManage(hackathonId, user)
  const a = await prisma.judgeAssignment.findFirst({ where: { id: assignmentId, entry: { stage: { hackathonId, judgingClosedAt: null } } }, include: { review: { select: { submittedAt: true } }, entry: { select: { stage: { select: { reviewMode: true } } } } } })
  if (!a) throw new ActionError('Assignment not found')
  if (a.entry.stage.reviewMode === 'all') throw new ActionError('In “all judges” stages every eligible judge reviews every submission - switch the stage to random judges to pick')
  if (a.review?.submittedAt) throw new ActionError('This judge already submitted a review - it can’t be removed')
  await prisma.judgeAssignment.delete({ where: { id: a.id } })
  await recordAudit({ actorId: user.id, action: 'hackathon.judging.unassign', entityType: 'StageEntry', entityId: a.entryId, before: { judgeId: a.judgeId } })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  return null
})

export const setJudgingClosed = action({ schema: z.object({ hackathonId: id, stageId: id, closed: z.boolean() }), permission: 'user' }, async ({ hackathonId, stageId, closed }, user) => {
  await assertManage(hackathonId, user)
  const stage = await prisma.hackathonStage.findFirst({ where: { id: stageId, hackathonId } })
  if (!stage) throw new ActionError('Stage not found')
  if (closed && new Date() < stage.closesAt) throw new ActionError('Submissions are still open - close judging after the stage ends')
  await prisma.hackathonStage.update({ where: { id: stageId }, data: { judgingClosedAt: closed ? new Date() : null } })
  await recordAudit({ actorId: user.id, action: closed ? 'hackathon.judging.close' : 'hackathon.judging.reopen', entityType: 'HackathonStage', entityId: stageId })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath('/judge', 'layout')
  return null
})

export const setAdvanced = action({ schema: z.object({ hackathonId: id, stageId: id, entryIds: z.array(id).max(1000), advanced: z.boolean() }), permission: 'user' }, async ({ hackathonId, stageId, entryIds, advanced }, user) => {
  const h = await assertManage(hackathonId, user)
  const stage = await prisma.hackathonStage.findFirst({ where: { id: stageId, hackathonId }, include: { hackathon: { select: { stages: { orderBy: { order: 'asc' }, select: { id: true, name: true } } } } } })
  if (!stage) throw new ActionError('Stage not found')
  if (!stage.judgingClosedAt) throw new ActionError('Close judging before advancing teams')
  const next = stage.hackathon.stages[stage.hackathon.stages.findIndex((s) => s.id === stageId) + 1]
  if (!next) throw new ActionError('This is the last stage - award prizes instead')
  if (!advanced) {
    const subs = await prisma.stageEntry.findMany({ where: { id: { in: entryIds }, stageId }, select: { submissionId: true } })
    if (await prisma.stageEntry.count({ where: { stageId: next.id, submissionId: { in: subs.map((x) => x.submissionId) } } })) throw new ActionError('Some of these teams already submitted to the next stage')
  }
  // Only entries of THIS stage with an active submission; newly advanced ones only (no repeat mails).
  const scope = { id: { in: entryIds }, stageId, submission: { status: 'active' } }
  const toMail = advanced ? (await prisma.stageEntry.findMany({ where: { ...scope, advancedAt: null }, select: { id: true } })).map((e) => e.id) : []
  const r = await prisma.stageEntry.updateMany({ where: advanced ? { ...scope, advancedAt: null } : scope, data: advanced ? { advancedAt: new Date(), advancedById: user.id } : { advancedAt: null, advancedById: null } })
  await recordAudit({ actorId: user.id, action: advanced ? 'hackathon.entry.advance' : 'hackathon.entry.unadvance', entityType: 'HackathonStage', entityId: stageId, after: { entryIds } })
  if (advanced) {
    const entries = await prisma.stageEntry.findMany({ where: { id: { in: toMail }, stageId }, include: { submission: { include: { project: { include: { members: { include: { user: { select: { email: true } } } }, currentVersion: { select: { name: true } } } } } } } })
    for (const e of entries) {
      for (const m of e.submission.project.members) {
        await sendMail({
          to: m.user.email,
          subject: `${e.submission.project.currentVersion?.name} advanced to ${next.name}`,
          text: `Congrats - your team advanced to "${next.name}" in ${h.event.name}.\n\n${siteUrl()}/events/${h.event.slug}`,
          html: brandedShell({ preheader: `You advanced to ${next.name}`, body: `<tr><td class="m-px" style="${CELL}"><p style="${PARA}">Congrats - <strong>${esc(e.submission.project.currentVersion?.name ?? 'your project')}</strong> advanced to <strong>${esc(next.name)}</strong> in ${esc(h.event.name)}.</p>${button(`${siteUrl()}/events/${h.event.slug}`, 'See what’s next')}</td></tr>` }),
        }).catch((err) => console.error('[judging] mail failed', err))
      }
    }
  }
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
  return { count: r.count }
})

export const setSubmissionStatus = action({ schema: z.object({ hackathonId: id, submissionId: id, status: z.enum(['active', 'disqualified']) }), permission: 'user' }, async ({ hackathonId, submissionId, status }, user) => {
  const h = await assertManage(hackathonId, user)
  const r = await prisma.submission.updateMany({ where: { id: submissionId, hackathonId, status: { not: 'withdrawn' } }, data: { status } })
  if (!r.count) throw new ActionError('Submission not found')
  await recordAudit({ actorId: user.id, action: status === 'disqualified' ? 'hackathon.submission.disqualify' : 'hackathon.submission.reinstate', entityType: 'Submission', entityId: submissionId })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
  return null
})

export const setAward = action({ schema: z.object({ hackathonId: id, prizeId: id, placement: z.number().int().min(1).max(100), submissionId: z.string().optional().transform((v) => v || null) }), permission: 'user' }, async ({ hackathonId, prizeId, placement, submissionId }, user) => {
  const h = await assertManage(hackathonId, user)
  const prize = await prisma.hackathonPrize.findFirst({ where: { id: prizeId, hackathonId } })
  if (!prize) throw new ActionError('Prize not found')
  if (!prizePlaces(prize).includes(placement)) throw new ActionError('That place isn’t part of this prize')
  if (submissionId) {
    const sub = await prisma.submission.findFirst({ where: { id: submissionId, hackathonId, status: 'active' } })
    if (!sub) throw new ActionError('Submission not found')
    if (prize.trackId && !sub.trackIds.includes(prize.trackId)) throw new ActionError('That team didn’t enter this prize’s track')
    if (await prisma.award.count({ where: { prizeId, submissionId, placement: { not: placement } } })) throw new ActionError('That team already has another place of this prize')
    await prisma.award.upsert({ where: { prizeId_placement: { prizeId, placement } }, create: { prizeId, placement, submissionId }, update: { submissionId } })
  } else {
    await prisma.award.deleteMany({ where: { prizeId, placement } })
  }
  await recordAudit({ actorId: user.id, action: 'hackathon.award.set', entityType: 'HackathonPrize', entityId: prizeId, after: { placement, submissionId } })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
  return null
})

export const setResultsPublished = action({ schema: z.object({ hackathonId: id, published: z.boolean() }), permission: 'user' }, async ({ hackathonId, published }, user) => {
  const h = await assertManage(hackathonId, user)
  if (published && !(await prisma.award.count({ where: { prize: { hackathonId } } }))) throw new ActionError('Award at least one prize first')
  await prisma.hackathon.update({ where: { id: hackathonId }, data: { resultsPublishedAt: published ? new Date() : null } })
  await recordAudit({ actorId: user.id, action: published ? 'hackathon.results.publish' : 'hackathon.results.unpublish', entityType: 'Hackathon', entityId: hackathonId })
  revalidatePath(`/manage/hackathons/${hackathonId}`, 'layout')
  revalidatePath(`/events/${h.event.slug}`, 'layout')
  return null
})

// ── judges ─────────────────────────────────────────────────────────────────

export const saveReview = action(
  {
    schema: z.object({
      assignmentId: id,
      scores: z.record(z.string(), z.number().min(0).max(100)),
      comment: z.string().trim().max(5000).optional().transform((v) => v || null),
      conflictDeclared: z.boolean(),
      submit: z.boolean(),
    }),
    permission: 'user',
  },
  async ({ assignmentId, scores, comment, conflictDeclared, submit }, user) => {
    const a = await prisma.judgeAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        judge: true,
        entry: { include: { stage: { include: { criteria: true } }, submission: { include: { project: { include: { members: { select: { userId: true } } } } } } } },
      },
    })
    if (!a || a.judge.userId !== user.id || a.entry.submission.status !== 'active') throw new ActionError('Assignment not found')
    if (!a.judge.termsAcceptedAt) throw new ActionError('Accept the judge terms first')
    const stage = a.entry.stage
    if (stage.judgingClosedAt) throw new ActionError('Judging is closed - reviews can no longer change')
    if (new Date() < stage.closesAt) throw new ActionError('Submissions are still open - reviewing starts when the stage closes')
    if (isConflicted(user.id, (a.entry.teamSnapshot as { userId: string }[]).map((m) => m.userId), a.entry.submission.project.members.map((m) => m.userId))) {
      throw new ActionError('You are on this team and can’t review it')
    }
    const clean = Object.fromEntries(stage.criteria.filter((c) => c.id in scores).map((c) => [c.id, scores[c.id]!]))
    if (Object.values(clean).some((v) => v > stage.scaleMax)) throw new ActionError(`Scores go from 0 to ${stage.scaleMax}`)
    const total = conflictDeclared ? null : weightedTotal(clean, stage.criteria, stage.scaleMax)
    if (submit && !conflictDeclared && total == null) throw new ActionError('Score every criterion before submitting')
    const existing = await prisma.review.findUnique({ where: { assignmentId }, select: { submittedAt: true } })
    if (existing?.submittedAt && !submit && !conflictDeclared) throw new ActionError('This review is submitted - update it instead of saving a draft')
    const data = { scores: clean, total, comment, conflictDeclared, submittedAt: submit || conflictDeclared ? new Date() : null }
    await prisma.review.upsert({ where: { assignmentId }, create: { assignmentId, ...data }, update: data })
    await recordAudit({ actorId: user.id, action: conflictDeclared ? 'hackathon.review.conflict' : submit ? 'hackathon.review.submit' : 'hackathon.review.draft', entityType: 'JudgeAssignment', entityId: assignmentId, after: { total } })
    revalidatePath('/judge', 'layout')
    return null
  },
)
