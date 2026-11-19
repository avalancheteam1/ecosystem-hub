'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { bountyDraftSchema, bountyIdSchema, bountyRevisionSchema } from './schemas'
import { publicationError } from './rules'

export const createBountyDraft = action(
  { permission: 'earn.publish', schema: z.strictObject({ id: bountyIdSchema, draft: bountyDraftSchema }) },
  async ({ id, draft }, user) => {
    await prisma.$transaction(async (tx) => {
      const result = await tx.earnBounty.createMany({ data: { id, ...draft }, skipDuplicates: true })
      if (result.count === 0) throw new ActionError('This draft was already saved. Reopen it from the publishing workspace.')
      await recordAudit({ actorId: user.id, action: 'earn.draft.create', entityType: 'EarnBounty', entityId: id, after: { revision: 1 } }, tx)
    })
    revalidatePath('/admin/earn')
    return { id }
  },
)

export const saveBountyDraft = action(
  { permission: 'earn.publish', schema: bountyRevisionSchema.extend({ draft: bountyDraftSchema }) },
  async ({ id, revision, draft }, user) => {
    await prisma.$transaction(async (tx) => {
      const result = await tx.earnBounty.updateMany({
        where: { id, revision, publishedAt: null },
        data: { ...draft, revision: { increment: 1 } },
      })
      if (result.count !== 1) throw new ActionError('The draft changed or was published. Reload it before editing.')
      await recordAudit({ actorId: user.id, action: 'earn.draft.update', entityType: 'EarnBounty', entityId: id, before: { revision }, after: { revision: revision + 1 } }, tx)
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
      const row = await tx.earnBounty.findUnique({
        where: { id, revision },
        select: { publishedAt: true, deadline: true },
      })
      if (!row) throw new ActionError('This bounty changed. Reload it before continuing.')
      const now = new Date()
      const error = publicationError(row.publishedAt, row.deadline, publish, now)
      if (error) throw new ActionError(error)
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
