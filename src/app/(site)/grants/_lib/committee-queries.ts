import 'server-only'
import { prisma } from '@/lib/db'
import { requireSuperAdmin, requireUser } from '@/lib/guards'
import { committeeReviewerAccess, committeeShortlisterId, readManagedCommitteeSettings } from './committee-config'
import { notFound } from 'next/navigation'
import { isFlagOn } from '@/lib/flag-store'
import { can } from '@/lib/permissions'

export async function readCommitteeSettings() {
  await requireSuperAdmin()
  if (!(await isFlagOn('grantsCommitteeInvitations'))) notFound()
  const shortlisterId = committeeShortlisterId()
  const [seats, eligible, shortlister, mailEnabled, reviewEnabled, settings] = await Promise.all([
    prisma.grantCommitteeSeat.findMany({
      orderBy: { slot: 'asc' },
      select: { id: true, slot: true, email: true, userId: true, expiresAt: true, user: { select: { name: true } } },
    }),
    prisma.grantCommitteeSeat.findMany({ where: { user: { is: committeeReviewerAccess } }, select: { id: true } }),
    shortlisterId ? prisma.user.findUnique({ where: { id: shortlisterId }, select: { name: true } }) : null,
    isFlagOn('grants'),
    isFlagOn('grantsCommitteeReview'),
    readManagedCommitteeSettings(prisma),
  ])
  return {
    seats: seats.map((seat) => ({ ...seat, active: !!seat.userId && seat.userId !== shortlisterId && eligible.some(({ id }) => id === seat.id) })),
    shortlister, mailEnabled, reviewEnabled, settings,
  }
}

export async function readMyCommitteeInvitation() {
  if (!(await isFlagOn('grantsCommitteeInvitations'))) notFound()
  const user = await requireUser()
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } })
  const seat = account?.emailVerified ? await prisma.grantCommitteeSeat.findFirst({
    where: { OR: [{ userId: user.id }, { userId: null, email: account.email.toLowerCase() }] },
    select: { id: true, userId: true, expiresAt: true },
  }) : null
  if (!seat || user.id === committeeShortlisterId()) return { status: 'missing' } as const
  if (seat.userId === user.id) return { status: can(user, 'grants.review') ? 'accepted' : 'access-removed' } as const
  if (seat.expiresAt <= new Date()) return { status: 'expired' } as const
  return { status: 'pending', id: seat.id } as const
}
