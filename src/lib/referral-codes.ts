import 'server-only'
import { Prisma } from '@prisma/client'
import { generateCode } from '@/app/(app)/referrals/_lib/rules'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

const isTaken = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

/** A new random code for `userId` (retries on collision), or null when no free code was found. Audited. */
export async function insertReferralCode(userId: string, label: string | null): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode()
    try {
      const row = await prisma.referralCode.create({ data: { code, label, userId } })
      await recordAudit({ actorId: userId, action: 'referralCode.create', entityType: 'ReferralCode', entityId: row.id, after: { code, label } })
      return code
    } catch (err) {
      if (!isTaken(err)) throw err
    }
  }
  return null
}

/**
 * Every user has a referral code: the oldest active one, created on first need
 * (sign-up, /referrals, share button). A user who deactivated all their codes
 * gets null — we don't resurrect what they switched off.
 */
export async function ensureReferralCode(userId: string): Promise<string | null> {
  const codes = await prisma.referralCode.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select: { code: true, active: true } })
  if (codes.length) return codes.find((c) => c.active)?.code ?? null
  // ponytail: two concurrent first views can create two codes — harmless, both work.
  return insertReferralCode(userId, 'Default')
}
