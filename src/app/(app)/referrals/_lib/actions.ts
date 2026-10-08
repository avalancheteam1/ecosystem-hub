'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { insertReferralCode } from '@/lib/referral-codes'
import { MAX_CODES_PER_USER } from './rules'

const label = z.string().trim().max(60).optional().transform((v) => v || null)

// Codes are always random — never user-chosen (no squatting, no lookalikes).
export const createReferralCode = action({ schema: z.object({ label }), permission: 'user' }, async (input, user) => {
  if ((await prisma.referralCode.count({ where: { userId: user.id } })) >= MAX_CODES_PER_USER) throw new ActionError(`You can have at most ${MAX_CODES_PER_USER} codes`)
  const code = await insertReferralCode(user.id, input.label)
  if (!code) throw new ActionError('Could not generate a free code, try again')
  revalidatePath('/referrals')
  return { code }
})

export const updateReferralCode = action(
  { schema: z.object({ id: z.string().min(1), label, active: z.boolean() }), permission: 'user' },
  async ({ id, ...data }, user) => {
    const before = await prisma.referralCode.findUnique({ where: { id }, select: { userId: true, label: true, active: true } })
    if (!before || before.userId !== user.id) throw new ActionError('Code not found')
    await prisma.referralCode.update({ where: { id }, data })
    await recordAudit({ actorId: user.id, action: 'referralCode.update', entityType: 'ReferralCode', entityId: id, before: { label: before.label, active: before.active }, after: data })
    revalidatePath('/referrals')
    return null
  },
)
