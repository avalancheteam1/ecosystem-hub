import 'server-only'
import { ActionError, ForbiddenError } from '@/lib/action'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/session'
import { canManageHackathon, needsOrganizerTerms } from './rules'

// NOT a 'use server' file on purpose: every export of a 'use server' module is a
// public endpoint, and this helper trusts its `user` argument.

/** Throws unless the user may manage this hackathon; returns it. */
export async function assertManage(hackathonId: string, user: CurrentUser) {
  const h = await prisma.hackathon.findUnique({ where: { id: hackathonId }, include: { organizers: { select: { userId: true, termsAcceptedAt: true } }, event: { select: { slug: true, status: true, name: true } } } })
  if (!h || !canManageHackathon(user, h.organizers)) throw new ForbiddenError('Forbidden')
  if (needsOrganizerTerms(user, h.organizers)) throw new ActionError('Accept the organiser terms first')
  return h
}

