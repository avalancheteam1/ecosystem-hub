import 'server-only'
import type { Prisma } from '@prisma/client'

// All writes that depend on other rows in the bounty take this lock first.
// This serializes cutoff, approval caps and announcement without global locks.
export async function lockBounty(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM earn_bounties WHERE id = ${id}::uuid FOR UPDATE`
}
