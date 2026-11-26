'use server'

import { logger } from '@/lib/logger'
import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'
import { canInviteSeeker, SEEKER_NOTE_MAX, TEAM_INVITES_PER_HOUR } from './team-finder'

// Find a team (/events/[slug]/team). Invites go by user id, never by email: the inviter never
// learns the invitee's address (ProjectInvite.inviteeUserId, accepted only by that user).

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const INVITE_DAYS = 14
const MAX_OPEN_INVITES = 20 // per project, like projects/_lib/actions.ts
const id = z.string().min(1)

/** Switch "looking for a team" on (with a note and the tracks of interest) or off. Active participants only. */
export const setLookingForTeam = action(
  {
    schema: z.object({
      hackathonId: id,
      looking: z.boolean(),
      note: z.string().trim().max(SEEKER_NOTE_MAX, `Note: at most ${SEEKER_NOTE_MAX} characters`).default(''),
      trackIds: z.array(z.string()).max(20).default([]).transform((t) => [...new Set(t)]),
    }),
    permission: 'user',
  },
  async ({ hackathonId, looking, note, trackIds }, user) => {
    const p = await prisma.participant.findUnique({
      where: { hackathonId_userId: { hackathonId, userId: user.id } },
      include: { teamSeeker: true, hackathon: { select: { status: true, event: { select: { slug: true } }, tracks: { select: { id: true } } } } },
    })
    if (!p || p.status !== 'active' || p.hackathon.status !== 'published') throw new ActionError('Join the hackathon first')
    if (trackIds.some((t) => !p.hackathon.tracks.some((x) => x.id === t))) throw new ActionError('Unknown track')
    if (looking) {
      const data = { note, trackIds }
      await prisma.teamSeeker.upsert({ where: { participantId: p.id }, create: { participantId: p.id, ...data }, update: data })
    } else {
      await prisma.teamSeeker.deleteMany({ where: { participantId: p.id } })
    }
    await recordAudit({ actorId: user.id, action: 'hackathon.team_seeker.set', entityType: 'Participant', entityId: p.id, before: p.teamSeeker ? { looking: true, note: p.teamSeeker.note, trackIds: p.teamSeeker.trackIds } : { looking: false }, after: looking ? { looking, note, trackIds } : { looking } })
    revalidatePath(`/events/${p.hackathon.event.slug}/team`)
    return null
  },
)

/** Invite a participant who is looking to my project (as writer). Mailed to them; the inviter never sees their email. */
export const inviteSeeker = action({ schema: z.object({ hackathonId: id, projectId: id, userId: id }), permission: 'user' }, async ({ hackathonId, projectId, userId }, user) => {
  if (!rateLimit(`team-invite:${user.id}`, { limit: TEAM_INVITES_PER_HOUR, windowMs: 3_600_000 }).ok) throw new ActionError('Too many invites sent - try again in an hour')
  const [h, membership, participants] = await Promise.all([
    prisma.hackathon.findUnique({ where: { id: hackathonId }, select: { status: true, event: { select: { name: true, slug: true } } } }),
    prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: user.id } }, select: { role: true, project: { select: { archivedAt: true, slug: true, currentVersion: { select: { name: true } } } } } }),
    prisma.participant.findMany({ where: { hackathonId, userId: { in: [user.id, userId] } }, select: { userId: true, status: true, teamSeeker: { select: { participantId: true } } } }),
  ])
  if (!h || h.status !== 'published') throw new ActionError('Hackathon not found')
  if (!membership) throw new ForbiddenError('You are not on this project')
  const inviter = participants.find((p) => p.userId === user.id)
  const invitee = participants.find((p) => p.userId === userId)
  const [onProject, openInvite, openCount] = await Promise.all([
    prisma.projectMember.count({ where: { projectId, userId } }),
    prisma.projectInvite.count({ where: { projectId, inviteeUserId: userId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.projectInvite.count({ where: { projectId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ])
  const check = canInviteSeeker({
    inviterRole: membership.role,
    inviterActive: inviter?.status === 'active',
    projectArchived: !!membership.project.archivedAt,
    inviterId: user.id,
    inviteeId: userId,
    inviteeActive: invitee?.status === 'active',
    inviteeLooking: !!invitee?.teamSeeker,
    inviteeOnProject: onProject > 0,
    openInviteExists: openInvite > 0,
  })
  if (!check.ok) {
    if (membership.role !== 'owner') throw new ForbiddenError(check.reason)
    throw new ActionError(check.reason)
  }
  if (openCount >= MAX_OPEN_INVITES) throw new ActionError(`A project can have at most ${MAX_OPEN_INVITES} open invites - revoke some first`)

  const to = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
  const token = crypto.randomBytes(32).toString('base64url')
  const invite = await prisma.projectInvite.create({
    data: { projectId, inviteeUserId: userId, role: 'writer', tokenHash: crypto.createHash('sha256').update(token).digest('hex'), invitedById: user.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) },
  })
  const name = membership.project.currentVersion?.name ?? 'a project'
  const url = `${siteUrl()}/projects/invite/${token}`
  await sendMail({
    to: to.email,
    subject: `${user.name} invited you to join ${name} for ${h.event.name}`,
    text: `${user.name} saw you're looking for a team in "${h.event.name}" and invited you to join "${name}" on the team1 Ecosystem Hub.\n\nAccept the invite:\n${url}\n\nThe link expires in ${INVITE_DAYS} days.`,
    html: brandedShell({
      preheader: `${user.name} invited you to join ${name}`,
      body: `<tr><td class="m-px" style="${CELL}">
        <p style="${PARA}">${esc(user.name)} saw you're looking for a team in <strong>${esc(h.event.name)}</strong> and invited you to join <strong>${esc(name)}</strong> on the team1 Ecosystem Hub.</p>
        <p style="${PARA}">The link expires in ${INVITE_DAYS} days.</p>
        ${button(url, 'See the invite')}
      </td></tr>`,
    }),
  }).catch((err) => logger.error({ err }, '[team-finder] invite mail failed'))
  await recordAudit({ actorId: user.id, action: 'project.invite.create', entityType: 'Project', entityId: projectId, after: { inviteId: invite.id, inviteeUserId: userId, role: 'writer', hackathonId } })
  revalidatePath(`/events/${h.event.slug}/team`)
  revalidatePath(`/projects/${membership.project.slug}`)
  return null
})
