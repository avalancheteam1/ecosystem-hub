import { prisma } from '@/lib/db'

/** Attach organiser/judge invites addressed to this user's VERIFIED email. Idempotent. */
export async function bindInvitesForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  if (!user?.emailVerified) return
  const email = user.email.toLowerCase()
  await prisma.$transaction([
    prisma.hackathonOrganizer.updateMany({ where: { email, userId: null }, data: { userId } }),
    prisma.hackathonJudge.updateMany({ where: { email, userId: null }, data: { userId } }),
  ])
}

/** The verified user an invite email belongs to right now, if any. */
export async function verifiedUserIdByEmail(email: string): Promise<string | null> {
  const u = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, emailVerified: true }, select: { id: true } })
  return u?.id ?? null
}
