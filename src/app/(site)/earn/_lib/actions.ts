'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { EARN_ORG_TYPES } from '@/lib/campus'
import { prisma } from '@/lib/db'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { isOwnUpload } from '@/lib/storage'
import { bountyDraftSchema, bountyIdSchema, bountyRevisionSchema, bountySaveSchema } from './schemas'
import { publicationError } from './rules'
import { lockBounty } from './write-lock'

const DEFAULT_ORGANIZATION_ID = 'team1-central'

function requireNativeTerms(stageCount: number, terms: string | null | undefined) {
  if (stageCount > 0 && !terms?.trim()) {
    throw new ActionError('Native bounties need approved terms before publishing or saving live.')
  }
}

async function validateAttribution(tx: Prisma.TransactionClient, bountyId: string, draft: { organizationId?: string; logoUrl?: string | null }) {
  if (draft.organizationId !== undefined) {
    const org = await tx.organization.findUnique({ where: { id: draft.organizationId }, select: { type: true, hidden: true } })
    if (!org || org.hidden || !EARN_ORG_TYPES.some((type) => type === org.type)) {
      throw new ActionError('Choose an eligible Earn organization.')
    }
  }
  if (draft.logoUrl && !isOwnUpload(draft.logoUrl, IMAGE_KINDS['earn-logo'].category, bountyId)) {
    throw new ActionError('Upload the logo for this bounty.')
  }
}

export const createBountyDraft = action(
  { permission: 'earn.publish', schema: z.strictObject({ id: bountyIdSchema, draft: bountyDraftSchema }) },
  async ({ id, draft: { stages = [], ...draft } }, user) => {
    await prisma.$transaction(async (tx) => {
      await validateAttribution(tx, id, draft)
      const result = await tx.earnBounty.createMany({ data: { id, ...draft, organizationId: draft.organizationId ?? DEFAULT_ORGANIZATION_ID }, skipDuplicates: true })
      if (result.count === 0) throw new ActionError('This draft was already saved. Reopen it from the publishing workspace.')
      if (stages.length) await tx.earnStage.createMany({ data: stages.map((stage, index) => ({ ...stage, bountyId: id, position: index + 1 })) })
      await recordAudit({ actorId: user.id, action: 'earn.draft.create', entityType: 'EarnBounty', entityId: id, after: { revision: 1, stages: stages.length } }, tx)
    })
    revalidatePath('/admin/earn')
    return { id }
  },
)

export const saveBountyDraft = action(
  {
    permission: 'earn.publish',
    schema: bountyRevisionSchema.extend({
      draft: bountySaveSchema,
      removedStageIds: z.array(bountyIdSchema.transform((id) => id.toLowerCase())).max(20).default([]),
    }).superRefine(({ draft, removedStageIds }, ctx) => {
      if (new Set(removedStageIds).size !== removedStageIds.length) {
        ctx.addIssue({ code: 'custom', path: ['removedStageIds'], message: 'List each removed stage only once.' })
      }
      if (removedStageIds.length && draft.stages === undefined) {
        ctx.addIssue({ code: 'custom', path: ['removedStageIds'], message: 'Provide a stage list to confirm removals.' })
      }
    }),
  },
  async ({ id, revision, removedStageIds, draft: { stages, ...draft } }, user) => {
    const published = await prisma.$transaction(async (tx) => {
      await lockBounty(tx, id)
      const where = { id, revision, cancelledAt: null, resultsAnnouncedAt: null }
      const before = await tx.earnBounty.findUnique({
        where,
        select: {
          terms: true, publishedAt: true, resultsAnnouncedAt: true, cancelledAt: true,
          stages: { orderBy: { position: 'asc' }, select: { id: true, position: true, requiresPrevApproval: true, requiresPullRequest: true, approvalLimit: true } },
        },
      })
      if (!before || before.cancelledAt || before.resultsAnnouncedAt) throw new ActionError('This bounty changed or is closed for editing. Reload it before continuing.')
      await validateAttribution(tx, id, draft)
      const activity = stages !== undefined && !!await tx.earnSubmission.findFirst({ where: { stage: { bountyId: id } }, select: { id: true } })
      if (activity && (stages.length !== before.stages.length || stages.some((stage, index) => {
        const saved = before.stages[index]
        return stage.id !== saved.id || stage.requiresPrevApproval !== saved.requiresPrevApproval || stage.requiresPullRequest !== saved.requiresPullRequest
      }))) throw new ActionError('Stages and their order must stay fixed after a submission.')

      if (stages === undefined && before.stages.length &&
          before.stages.filter((stage) => stage.requiresPullRequest).length !== Number(!!draft.hubModule)) {
        throw new ActionError('Update the bounty stages to match its GitHub requirements.')
      }
      const savedById = new Map(before.stages.map((stage) => [stage.id, stage]))
      const retainedIds = new Set<string>()
      // The existing unpublished editor submits a positional list without stage IDs.
      const positionalDraft = !before.publishedAt && !activity && stages?.every((stage) => !stage.id)
      const plan = stages?.map(({ id: stageId, ...data }, index) => {
        const saved = stageId ? savedById.get(stageId) : positionalDraft ? before.stages[index] : undefined
        if ((stageId && !saved) || (saved && retainedIds.has(saved.id))) throw new ActionError('Use each saved stage at most once and only on its own bounty.')
        if (saved) retainedIds.add(saved.id)
        if (index === stages.length - 1 && data.approvalLimit === null &&
            (!saved || saved.id !== before.stages.at(-1)?.id || saved.approvalLimit !== null)) {
          throw new ActionError('Set an approval limit for the final stage.')
        }
        return { saved, data, position: index + 1 }
      })
      const removed = plan ? before.stages.filter((stage) => !retainedIds.has(stage.id)).map((stage) => stage.id) : []
      if ((removedStageIds.length > 0 || (before.publishedAt && stages !== undefined)) &&
          (removedStageIds.length !== removed.length || removed.some((stageId) => !removedStageIds.includes(stageId)))) {
        throw new ActionError('Confirm stage removals by listing exactly the saved stages omitted from the new stage list.')
      }
      if (before.publishedAt) {
        requireNativeTerms(stages?.length ?? before.stages.length, draft.terms === undefined ? before.terms : draft.terms)
      }
      const changedCaps = activity ? (plan ?? []).flatMap(({ saved, data: { approvalLimit } }) =>
        saved && approvalLimit !== null && approvalLimit !== saved.approvalLimit ? [{ id: saved.id, approvalLimit }] : [],
      ) : []
      if (changedCaps.length) {
        const counts = await tx.earnSubmission.groupBy({
          by: ['stageId'],
          where: { stageId: { in: changedCaps.map(({ id }) => id) }, status: 'approved' },
          _count: { _all: true },
        })
        const approvedByStage = new Map(counts.map(({ stageId, _count }) => [stageId, _count._all]))
        if (changedCaps.some(({ id, approvalLimit }) => (approvedByStage.get(id) ?? 0) > approvalLimit)) {
          throw new ActionError('The approval limit cannot be below the number already approved.')
        }
      }

      const termsChanged = draft.terms !== undefined && draft.terms !== (before.terms?.trim() || null)
      const result = await tx.earnBounty.updateMany({
        where,
        data: { ...draft, revision: { increment: 1 }, ...(termsChanged ? { termsVersion: { increment: 1 } } : {}) },
      })
      if (result.count !== 1) throw new ActionError('This bounty changed or is closed for editing. Reload it before continuing.')
      if (plan) {
        if (removed.length) await tx.earnStage.deleteMany({ where: { bountyId: id, id: { in: removed } } })
        // Vacate moved positions before assigning any final positions under the unique index.
        for (const { saved, position } of plan) {
          if (saved && saved.position !== position) {
            await tx.earnStage.update({ where: { id: saved.id, bountyId: id }, data: { position: -position } })
          }
        }
        for (const { saved, data, position } of plan) {
          if (!saved) continue
          const { requiresPrevApproval, requiresPullRequest, ...editable } = data
          await tx.earnStage.update({
            where: { id: saved.id, bountyId: id },
            data: activity ? editable : { ...editable, requiresPrevApproval, requiresPullRequest, position },
          })
        }
        const added = plan.filter(({ saved }) => !saved).map(({ data, position }) => ({ ...data, position, bountyId: id }))
        if (added.length) await tx.earnStage.createMany({ data: added })
      }
      await recordAudit({ actorId: user.id, action: 'earn.draft.update', entityType: 'EarnBounty', entityId: id, before: { revision }, after: { revision: revision + 1, stages: stages?.length ?? before.stages.length } }, tx)
      return !!before.publishedAt
    })
    if (published) {
      revalidatePath('/earn')
      revalidatePath(`/earn/${id}`)
    }
    revalidatePath('/admin/earn')
    revalidatePath(`/admin/earn/${id}`)
    return { id }
  },
)

export const setBountyPublication = action(
  { permission: 'earn.publish', schema: bountyRevisionSchema.extend({ publish: z.boolean() }) },
  async ({ id, revision, publish }, user) => {
    await prisma.$transaction(async (tx) => {
      await lockBounty(tx, id)
      const row = await tx.earnBounty.findUnique({
        where: { id, revision, cancelledAt: null },
        select: { publishedAt: true, deadline: true, resultsAnnouncedAt: true, terms: true, _count: { select: { stages: true } } },
      })
      if (!row) throw new ActionError('This bounty changed. Reload it before continuing.')
      const now = new Date()
      const error = publicationError(row.publishedAt, row.deadline, publish, now)
      if (error) throw new ActionError(error)
      if (publish) requireNativeTerms(row._count.stages, row.terms)
      if (!publish && (row.resultsAnnouncedAt || await tx.earnSubmission.findFirst({ where: { stage: { bountyId: id } }, select: { id: true } }))) {
        throw new ActionError('This bounty has recorded activity and must stay published.')
      }
      const result = await tx.earnBounty.updateMany({
        where: { id, revision, ...(publish ? { deadline: { gt: now } } : {}) },
        data: { publishedAt: publish ? now : null, revision: { increment: 1 } },
      })
      if (result.count !== 1) throw new ActionError('This bounty changed. Reload it before continuing.')
      await recordAudit({
        actorId: user.id,
        action: publish ? 'earn.listing.publish' : 'earn.listing.unpublish',
        entityType: 'EarnBounty',
        entityId: id,
        before: { published: !publish, revision },
        after: { published: publish, revision: revision + 1 },
      }, tx)
    })
    revalidatePath('/earn')
    revalidatePath(`/earn/${id}`)
    revalidatePath('/sitemap.xml')
    revalidatePath('/admin/earn')
    revalidatePath(`/admin/earn/${id}`)
    return { id }
  },
)
