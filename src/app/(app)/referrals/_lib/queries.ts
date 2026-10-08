import 'server-only'
import { prisma } from '@/lib/db'
import { referralStats } from './rules'

// ponytail: stats bucket in JS over all rows; move to SQL GROUP BY when a group passes ~50k referrals.

export async function getMyReferrals(userId: string) {
  const [codes, rows] = await Promise.all([
    prisma.referralCode.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, include: { _count: { select: { referrals: true } } } }),
    prisma.referral.findMany({ where: { referrerId: userId }, select: { createdAt: true, referrerId: true } }),
  ])
  return {
    codes: codes.map((c) => ({ id: c.id, code: c.code, label: c.label, active: c.active, onboardings: c._count.referrals })),
    stats: referralStats(rows, new Date()),
  }
}

/** Snapshot-based group stats + referrer names (never the referred users). */
export async function getGroupStats(groupId: string) {
  const rows = await prisma.referral.findMany({ where: { groups: { some: { groupId } } }, select: { createdAt: true, referrerId: true } })
  const stats = referralStats(rows, new Date())
  const users = await prisma.user.findMany({ where: { id: { in: stats.perReferrer.map((r) => r.referrerId) } }, select: { id: true, name: true } })
  return { ...stats, names: Object.fromEntries(users.map((u) => [u.id, u.name])) as Record<string, string> }
}
