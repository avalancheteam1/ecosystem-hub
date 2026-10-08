import 'server-only'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { getUserGroups } from '@/lib/user-groups'
import { canAttribute, normalizeCode } from './rules'

/**
 * Credit a NEW account to the owner of the `ref` cookie's code, with a snapshot
 * of the referrer's groups (manual + portal) at this moment. Called from the
 * Better Auth user.create.after hook; the caller swallows errors.
 */
export async function attributeReferral(newUserId: string, rawCode: string | null): Promise<void> {
  const value = normalizeCode(rawCode)
  if (!value) return
  const code = await prisma.referralCode.findUnique({ where: { code: value }, select: { id: true, userId: true, active: true } })
  if (!canAttribute(code, newUserId)) return
  const { counting } = await getUserGroups(code.userId)
  const groupIds = counting.map((g) => g.group.id)
  const referral = await prisma.referral.create({
    data: { referredUserId: newUserId, codeId: code.id, referrerId: code.userId, groups: { create: groupIds.map((groupId) => ({ groupId })) } },
  })
  await recordAudit({ actorId: newUserId, action: 'referral.attribute', entityType: 'Referral', entityId: referral.id, after: { codeId: code.id, referrerId: code.userId, groupIds } })
}
