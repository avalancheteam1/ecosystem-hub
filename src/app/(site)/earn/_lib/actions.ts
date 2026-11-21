'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { bountyDraftSchema, bountyIdSchema, bountyRevisionSchema } from './schemas'
import { publicationError } from './rules'
import { lockBounty } from './write-lock'

export const createBountyDraft = action(
  { permission: 'earn.publish', schema: z.strictObject({ id: bountyIdSchema, draft: bountyDraftSchema }) },
  async ({ id, draft: { stages = [], ...draft } }, user) => {
    await prisma.$transaction(async (tx) => {
      const result = await tx.earnBounty.createMany({ data: { id, ...draft }, skipDuplicates: true })
      if (result.count === 0) throw new ActionError('This draft was already saved. Reopen it from the publishing workspace.')
      if (stages.length) await tx.earnStage.createMany({ data: stages.map((stage, index) => ({ ...stage, bountyId: id, position: index + 1 })) })
      await recordAudit({ actorId: user.id, action: 'earn.draft.create', entityType: 'EarnBounty', entityId: id, after: { revision: 1, stages: stages.length } }, tx)
    })
    revalidatePath('/admin/earn')
    return { id }
  },
)

export const saveBountyDraft = action(
  { permission: 'earn.publish', schema: bountyRevisionSchema.extend({ draft: bountyDraftSchema }) },
  async ({ id, revision, draft: { stages = [], ...draft } }, user) => {
    await prisma.$transaction(async (tx) => {
      await lockBounty(tx, id)
      const before = await tx.earnBounty.findUnique({ where: { id, revision, publishedAt: null, cancelledAt: null }, select: { terms: true } })
      if (!before) throw new ActionError('The draft changed or was published. Reload it before editing.')
      const result = await tx.earnBounty.updateMany({
        where: { id, revision, publishedAt: null, cancelledAt: null },
        data: { ...draft, revision: { increment: 1 }, ...(draft.terms !== undefined && draft.terms !== before.terms ? { termsVersion: { increment: 1 } } : {}) },
      })
      if (result.count !== 1) throw new ActionError('The draft changed or was published. Reload it before editing.')
      await tx.earnStage.deleteMany({ where: { bountyId: id } })
      if (stages.length) await tx.earnStage.createMany({ data: stages.map((stage, index) => ({ ...stage, bountyId: id, position: index + 1 })) })
      await recordAudit({ actorId: user.id, action: 'earn.draft.update', entityType: 'EarnBounty', entityId: id, before: { revision }, after: { revision: revision + 1, stages: stages.length } }, tx)
    })
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
        select: { publishedAt: true, deadline: true, resultsAnnouncedAt: true },
      })
      if (!row) throw new ActionError('This bounty changed. Reload it before continuing.')
      const now = new Date()
      const error = publicationError(row.publishedAt, row.deadline, publish, now)
      if (error) throw new ActionError(error)
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
