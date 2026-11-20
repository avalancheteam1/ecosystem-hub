'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { findVerifiedBuilder } from '@/lib/builder-lookup'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA, SMALL } from '@/lib/email-template'
import { logger } from '@/lib/logger'
import { sendMail } from '@/lib/mailer'
import { requireProjectOwner as requireOwner } from '@/lib/project-access'
import { ASSIGNABLE_ROLES, parseInviteTarget } from '@/lib/project-team'
import { rateLimit } from '@/lib/rate-limit'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const INVITE_DAYS = 14
// Invites mail any address from our domain - caps keep that from becoming a spam/phishing relay.
const MAX_OPEN_INVITES = 20
const INVITES_PER_HOUR = 20
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

export const inviteMember = action(
  { schema: z.object({ projectId: z.string().min(1), email: z.string().trim().max(320).refine((v) => !!parseInviteTarget(v), 'Enter an email or @Telegram handle'), role: z.enum(ASSIGNABLE_ROLES), sendEmail: z.boolean().default(true) }), permission: 'user' },
  async ({ projectId, email: target, role, sendEmail }, user) => {
    await requireOwner(projectId, user.id)
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: { select: { name: true } } } })
    if (!project || project.archivedAt) throw new ActionError('Project not found')
    const identity = parseInviteTarget(target)!
    const match = 'handle' in identity ? await findVerifiedBuilder(identity) : null
    if ('handle' in identity && !match) throw new ActionError('Use an email instead: this handle does not identify exactly one verified builder')
    const email = 'email' in identity ? identity.email : match!.email.toLowerCase()
    const already = await prisma.projectMember.findFirst({ where: { projectId, user: { email } } })
    if (already) throw new ActionError('That person is already on the team') // never re-invite (no downgrades)
    const open = await prisma.projectInvite.count({ where: { projectId, email: { not: email }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })
    if (open >= MAX_OPEN_INVITES) throw new ActionError(`A project can have at most ${MAX_OPEN_INVITES} open invites - revoke some first`)
    if (!rateLimit(`project-invite:${user.id}`, { limit: INVITES_PER_HOUR, windowMs: 3_600_000 }).ok) throw new ActionError('Too many invites sent - try again in an hour')
    const token = crypto.randomBytes(32).toString('base64url')
    await prisma.$transaction([
      prisma.projectInvite.updateMany({ where: { projectId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.projectInvite.create({ data: { projectId, email, role, tokenHash: hashToken(token), invitedById: user.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } }),
    ])
    const name = project.currentVersion?.name ?? 'a project'
    if (sendEmail) await sendMail({
      to: email,
      subject: `${user.name} invited you to ${name} on the team1 Ecosystem Hub`,
      text: `${user.name} invited you to join the team of "${name}" on the team1 Ecosystem Hub.\n\nAccept the invite (sign in with ${email}):\n${siteUrl()}/projects/invite/${token}\n\nThe link expires in ${INVITE_DAYS} days.`,
      html: brandedShell({
        preheader: `${user.name} invited you to ${name}`,
        body: `<tr><td class="m-px" style="${CELL}">
          <p style="${PARA}">Hey,</p>
          <p style="${PARA}">${esc(user.name)} invited you to join the team of <strong>${esc(name)}</strong> on the team1 Ecosystem Hub.</p>
          <p style="${PARA}">Sign in with ${esc(email)} to accept. The link expires in ${INVITE_DAYS} days.</p>
          ${button(`${siteUrl()}/projects/invite/${token}`, 'Accept invite')}
          <p style="${SMALL}">Or copy this link:<br/>${esc(`${siteUrl()}/projects/invite/${token}`)}</p>
        </td></tr>`,
      }),
    }).catch((err) => logger.error({ err }, '[projects] invite mail failed'))
    await recordAudit({ actorId: user.id, action: 'project.invite.create', entityType: 'Project', entityId: projectId, after: { role, delivery: sendEmail ? 'email' : 'link' } })
    revalidatePath(`/projects/${project.slug}`)
    return { invitePath: `/projects/invite/${token}` }
  },
)
