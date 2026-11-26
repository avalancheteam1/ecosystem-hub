'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action } from '@/lib/action'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import { writeAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { requireFlag } from '@/lib/flag-store'
import { button, brandedShell, CELL, PARA } from '@/lib/email-template'
import { logger } from '@/lib/logger'
import { sendMail } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'
import { committeeShortlisterId, readManagedCommitteeSettings } from './committee-config'
import { committeeApprovalRules, maxCommitteeSize } from './committee-policy'

const settingsPath = '/admin/grants/committee'
const joinPath = '/grants/committee/join'
const lifetime = 7 * 86_400_000
const idSchema = z.object({ id: z.string().min(1).max(64) })

async function changeSeats<T>(write: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await prisma.$transaction(write, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (error instanceof ActionError) throw error
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025', 'P2034'].includes(error.code))
      throw new ActionError('The Committee roster changed. Reload the page and try again.')
    // Driver error metadata may contain the invited email address.
    throw new Error('Grants Committee roster change failed')
  }
}

async function requireInvitations() {
  await requireFlag('grantsCommitteeInvitations')
  await requireFlag('grants')
}

function checkMailRate(actorId: string) {
  if (!rateLimit('grant-committee-invite:' + actorId, { limit: 16, windowMs: 3_600_000 }).ok)
    throw new ActionError('Too many Committee invitation emails. Try again in an hour.')
}

async function deliverInvitation(email: string) {
  const url = (process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network') + joinPath
  try {
    await sendMail({
      to: email,
      subject: 'Join the Grants Committee on the team1 Ecosystem Hub',
      text: 'You are invited to join the Grants Committee. Sign in with this email address to accept within seven days.\n\n' + url,
      html: brandedShell({
        preheader: 'You’ve been invited to the Grants Committee',
        body: `<tr><td class="m-px" style="${CELL}">
          <p style="${PARA}">You’re invited to join the Grants Committee. Sign in with this email address to accept within seven days.</p>
          ${button(url, 'View invitation')}
        </td></tr>`,
      }),
    })
    return true
  } catch {
    logger.warn('Grants Committee invitation email failed to send')
    return false
  }
}

const approvalRuleSchema = z.enum(committeeApprovalRules)
const committeeSettingsSchema = z.object({
  revision: z.number().int().nonnegative(),
  seatCount: z.number().int().min(1).max(maxCommitteeSize),
  approvalRule: approvalRuleSchema,
})

export const updateCommitteeSettings = action(
  { permission: 'superAdmin', schema: committeeSettingsSchema },
  async ({ revision, seatCount, approvalRule }, actor) => {
    await requireFlag('grantsCommitteeInvitations')
    await changeSeats(async (tx) => {
      const current = await readManagedCommitteeSettings(tx)
      if (current.revision !== revision) throw new ActionError('Committee settings changed. Reload the page and try again.')
      if (current.seatCount !== seatCount && await tx.grantCommitteeSeat.count() > seatCount)
        throw new ActionError('Revoke pending invitations or remove members from the future roster before reducing the seat count.')
      if (current.seatCount === seatCount && current.approvalRule === approvalRule) return
      const settings = { seatCount, approvalRule, revision: revision + 1 }
      await tx.grantCommitteeSettings.upsert({ where: { id: 1 }, create: settings, update: settings })
      await writeAudit(tx, {
        actorId: actor.id, action: 'grant.committee.settings', entityType: 'GrantCommitteeSettings', entityId: '1',
        before: current, after: settings,
      })
    })
    revalidatePath(settingsPath)
  },
)

export const removeCommitteeMember = action({ permission: 'superAdmin', schema: idSchema }, async ({ id }, actor) => {
  await requireFlag('grantsCommitteeInvitations')
  await changeSeats(async (tx) => {
    const seat = await tx.grantCommitteeSeat.findUnique({ where: { id }, select: { userId: true, slot: true } })
    if (!seat?.userId) throw new ActionError('That member is no longer on the Committee roster.')
    const removed = await tx.grantCommitteeSeat.deleteMany({ where: { id, userId: seat.userId } })
    if (!removed.count) throw new ActionError('That member is no longer on the Committee roster.')
    await writeAudit(tx, {
      actorId: actor.id, action: 'grant.committee.remove', entityType: 'GrantCommitteeSeat', entityId: id,
      before: { userId: seat.userId, slot: seat.slot }, after: { removedFromFutureReviews: true },
    })
  })
  revalidatePath(settingsPath)
  revalidatePath(joinPath)
})

export const inviteCommitteeMember = action(
  { permission: 'superAdmin', schema: z.object({ email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address') }) },
  async ({ email }, actor) => {
    await requireInvitations()
    checkMailRate(actor.id)
    const shortlisterId = committeeShortlisterId()
    await changeSeats(async (tx) => {
      const occupied = await tx.grantCommitteeSeat.findMany({ select: { slot: true, email: true } })
      if (occupied.some((seat) => seat.email === email)) throw new ActionError('This email address is already on the Committee roster.')
      const { seatCount } = await readManagedCommitteeSettings(tx)
      if (occupied.length >= seatCount) throw new ActionError('All configured seats are reserved. Free a seat or increase the Committee size.')
      const occupiedSlots = new Set(occupied.map(({ slot }) => slot))
      let slot = 1
      while (occupiedSlots.has(slot)) slot++
      const shortlister = shortlisterId && await tx.user.findUnique({ where: { id: shortlisterId }, select: { email: true } })
      if (shortlister && shortlister.email.toLowerCase() === email)
        throw new ActionError('The designated shortlister cannot occupy a voting seat.')
      const accepted = await tx.grantCommitteeSeat.findFirst({
        where: { user: { is: { email: { equals: email, mode: 'insensitive' } } } },
        select: { id: true },
      })
      if (accepted) throw new ActionError('This account is already on the Committee roster.')
      const seat = await tx.grantCommitteeSeat.create({ data: { slot, email, expiresAt: new Date(Date.now() + lifetime) } })
      await writeAudit(tx, {
        actorId: actor.id, action: 'grant.committee.invite', entityType: 'GrantCommitteeSeat', entityId: seat.id,
        after: { slot, pending: true },
      })
    })
    revalidatePath(settingsPath)
    return { mailSent: await deliverInvitation(email) }
  },
)

export const resendCommitteeInvitation = action({ permission: 'superAdmin', schema: idSchema }, async ({ id }, actor) => {
  await requireInvitations()
  checkMailRate(actor.id)
  const email = await changeSeats(async (tx) => {
    const seat = await tx.grantCommitteeSeat.findUnique({ where: { id }, select: { email: true, userId: true, slot: true } })
    if (!seat || seat.userId) throw new ActionError('The invitation is no longer pending.')
    const renewed = await tx.grantCommitteeSeat.updateMany({
      where: { id, userId: null }, data: { expiresAt: new Date(Date.now() + lifetime) },
    })
    if (!renewed.count) throw new ActionError('The invitation is no longer pending.')
    await writeAudit(tx, {
      actorId: actor.id, action: 'grant.committee.resend', entityType: 'GrantCommitteeSeat', entityId: id,
      after: { slot: seat.slot, pending: true },
    })
    return seat.email
  })
  revalidatePath(settingsPath)
  return { mailSent: await deliverInvitation(email) }
})

export const revokeCommitteeInvitation = action({ permission: 'superAdmin', schema: idSchema }, async ({ id }, actor) => {
  await requireFlag('grantsCommitteeInvitations')
  await changeSeats(async (tx) => {
    const removed = await tx.grantCommitteeSeat.deleteMany({ where: { id, userId: null } })
    if (!removed.count) throw new ActionError('The invitation is no longer pending.')
    await writeAudit(tx, {
      actorId: actor.id, action: 'grant.committee.revoke', entityType: 'GrantCommitteeSeat', entityId: id,
      after: { revoked: true },
    })
  })
  revalidatePath(settingsPath)
})

export const acceptCommitteeInvitation = action({ permission: 'user', schema: idSchema }, async ({ id }, actor) => {
  await requireInvitations()
  if (actor.id === committeeShortlisterId()) throw new ForbiddenError('The designated shortlister cannot occupy a voting seat.')

  await changeSeats(async (tx) => {
    const recipient = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true, emailVerified: true } })
    if (!recipient?.emailVerified) throw new ForbiddenError('Sign in with the verified email address that was invited.')
    const claimed = await tx.grantCommitteeSeat.updateMany({
      where: { id, email: recipient.email.toLowerCase(), userId: null, expiresAt: { gt: new Date() } },
      data: { userId: actor.id },
    })
    if (!claimed.count) throw new ForbiddenError('There is no current Committee invitation for this account.')
    await tx.userPermission.upsert({
      where: { userId_permission: { userId: actor.id, permission: 'grants.review' } },
      create: { userId: actor.id, permission: 'grants.review' },
      update: {},
    })
    await writeAudit(tx, {
      actorId: actor.id, action: 'grant.committee.accept', entityType: 'GrantCommitteeSeat', entityId: id,
      after: { active: true, permission: 'grants.review' },
    })
  })
  revalidatePath(settingsPath)
  revalidatePath(joinPath)
})
