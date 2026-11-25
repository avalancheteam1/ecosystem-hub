import 'server-only'
import { prisma } from '@/lib/db'

/** Exact identity only. Ambiguous handles never choose an arbitrary account. */
export async function findVerifiedBuilder(target: { email: string } | { handle: string }) {
  const matches = await prisma.user.findMany({
    where: { emailVerified: true, ...('email' in target ? { email: { equals: target.email, mode: 'insensitive' as const } } : { telegramAccount: { equals: target.handle, mode: 'insensitive' as const } }) },
    select: { id: true, name: true, email: true },
    take: 2,
  })
  return matches.length === 1 ? matches[0]! : null
}
