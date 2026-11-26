'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { action, ForbiddenError, ActionError } from '@/lib/action'
import { can } from '@/lib/permissions'
import { recordAudit } from '@/lib/audit'
import { requireFlag } from '@/lib/flag-store'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { id, text, stateSchema, roundSchema, roundChoice, storedRoundChoice } from './schemas'
import { json } from './store'
import { assertReviewer, hasRoundConflict } from './staff'
import { readiness, score } from './rules'

export const createRound = action({ schema: roundSchema, permission: 'grants.manage' }, async (input, user) => {
  await requireFlag('grants')
  await requireFlag('grantsRoundManagement')
  if (!can(user, 'grants.review')) throw new ForbiddenError('Grant review access is also required')
  const row = await prisma.grantRound.create({ data: input, select: { id: true } })
  await recordAudit({ actorId: user.id, action: 'grant.round.create', entityType: 'GrantRound', entityId: row.id, after: input })
  revalidatePath('/grants')
  revalidatePath('/admin/grants/rounds')
  return row
})

export const setRoundOpen = action(
  { schema: z.object({ roundId: id, revision: z.number().int().nonnegative(), published: z.boolean() }), permission: 'grants.manage' },
  async (input, user) => {
    await requireFlag('grants')
    await requireFlag('grantsRoundManagement')
    if (!can(user, 'grants.review')) throw new ForbiddenError('Grant review access is also required')
    const r = await prisma.grantRound.updateMany({
      where: { id: input.roundId, revision: input.revision },
      data: { published: input.published, revision: { increment: 1 } },
    })
    if (!r.count) throw new ActionError('Round changed. Refresh before saving.')
    await recordAudit({
      actorId: user.id,
      action: 'grant.round.open',
      entityType: 'GrantRound',
      entityId: input.roundId,
      before: { revision: input.revision },
      after: { published: input.published, revision: input.revision + 1 },
    })
    revalidatePath('/grants', 'layout')
    revalidatePath('/admin/grants/rounds')
  },
)

const choice = roundChoice
export const chooseForRound = action(
  { schema: z.object({ roundId: id, revision: z.number().int().nonnegative(), applicationId: id, choice }), permission: 'grants.manage' },
  async (input, user) => {
    await requireFlag('grants')
    await requireFlag('grantsRoundManagement')
    if (!can(user, 'grants.review')) throw new ForbiddenError('Grant review access is also required')
    await prisma.$transaction(
      async (tx) => {
        const row = await tx.grantRound.findUnique({
          where: { id: input.roundId },
          select: {
            id: true,
            revision: true,
            choices: true,
            applications: { where: { id: input.applicationId, status: { not: 'draft' } }, select: { id: true } },
          },
        })
        if (!row || !row.applications.length) throw new ActionError('Application is outside this review set')
        if (await hasRoundConflict(tx, row.id, user.id))
          throw new ForbiddenError('A project member cannot choose grant priorities in their own review round')
        await assertReviewer(tx, input.choice.ownerId, user)
        const previous = z.record(z.string(), storedRoundChoice).parse(row.choices)
        const old = previous[input.applicationId]
        const history = old
          ? [
              ...old.history,
              { disposition: old.disposition, ownerId: old.ownerId, rationale: old.rationale, actorId: old.actorId, at: old.at },
            ]
          : []
        const next = { ...input.choice, actorId: user.id, at: new Date().toISOString(), history }
        const r = await tx.grantRound.updateMany({
          where: { id: row.id, revision: input.revision },
          data: { choices: json({ ...previous, [input.applicationId]: next }), revision: { increment: 1 } },
        })
        if (!r.count) throw new ActionError('Round changed. Refresh before saving.')
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    await recordAudit({
      actorId: user.id,
      action: 'grant.round.choice',
      entityType: 'GrantRound',
      entityId: input.roundId,
      after: { applicationId: input.applicationId, ...input.choice },
    })
    revalidatePath('/admin/grants/rounds')
  },
)

export const snapshotRound = action(
  { schema: z.object({ roundId: id, revision: z.number().int().nonnegative(), note: text }), permission: 'grants.manage' },
  async (input, user) => {
    await requireFlag('grants')
    await requireFlag('grantsRoundManagement')
    if (!can(user, 'grants.review')) throw new ForbiddenError('Grant review access is also required')
    const result = await prisma.$transaction(
      async (tx) => {
        const row = await tx.grantRound.findUnique({
          where: { id: input.roundId },
          select: {
            id: true,
            revision: true,
            choices: true,
            applications: {
              where: { status: { not: 'draft' } },
              select: {
                id: true,
                revision: true,
                projectVersionId: true,
                projectVersion: { select: { name: true, maturity: true } },
                state: true,
              },
            },
          },
        })
        if (!row || row.revision !== input.revision) throw new ActionError('Round changed. Refresh before recording a snapshot.')
        if (await hasRoundConflict(tx, row.id, user.id))
          throw new ForbiddenError('A project member cannot freeze their own review round')
        const result = await tx.grantRoundSnapshot.create({
          data: {
            roundId: row.id,
            number: row.revision + 1,
            actorId: user.id,
            note: input.note,
            data: json({
              rubric: 'Internal v2.0 proposal',
              choices: row.choices,
              members: row.applications.map((a) => {
                const s = stateSchema.parse(a.state)
                return {
                  id: a.id,
                  revision: a.revision,
                  projectVersionId: a.projectVersionId,
                  name: a.projectVersion.name,
                  maturity: a.projectVersion.maturity,
                  assessment: s.assessment,
                  score: score(s.assessment),
                  holds: readiness(s, s.answers.intakeVersion === undefined ? s.answers.terms.route : undefined),
                }
              }),
            }),
          },
          select: { id: true },
        })
        const r = await tx.grantRound.updateMany({ where: { id: row.id, revision: input.revision }, data: { revision: { increment: 1 } } })
        if (!r.count) throw new ActionError('Round changed. Refresh before recording a snapshot.')
        return result
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    await recordAudit({
      actorId: user.id,
      action: 'grant.round.snapshot',
      entityType: 'GrantRoundSnapshot',
      entityId: result.id,
      after: { roundId: input.roundId, revision: input.revision + 1 },
    })
    revalidatePath('/admin/grants/rounds')
    return result
  },
)
