'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA, SMALL } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { shortId, slugify, withSuffix } from '@/lib/slug'
import { isOwnUpload } from '@/lib/storage'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { fieldsOf, planSave, projectFieldsSchema, versionChanged, type ProjectFields } from './rules'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const INVITE_DAYS = 14
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

async function membership(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!m) throw new ActionError('You are not on this project')
  return m
}

function versionData(f: ProjectFields) {
  return { ...f, deployedAddresses: f.deployedAddresses as object[], websites: f.websites as object[], socials: f.socials as object[] }
}

/** Images must be our own uploads for this project (or this user's pre-create uploads) — no hotlinked URLs. */
function assertOwnImages(f: ProjectFields, projectId: string | null, userId: string) {
  const owners = [`new-${userId}`, ...(projectId ? [projectId] : [])]
  const own = (url: string, kind: 'project-logo' | 'project-cover' | 'project-screenshot') => owners.some((o) => isOwnUpload(url, IMAGE_KINDS[kind].category, o))
  if (f.logoUrl && !own(f.logoUrl, 'project-logo')) throw new ActionError('Upload the logo here')
  if (f.coverUrl && !own(f.coverUrl, 'project-cover')) throw new ActionError('Upload the cover image here')
  if (f.screenshots.some((u) => !own(u, 'project-screenshot'))) throw new ActionError('Upload screenshots here')
}

export const createProject = action({ schema: z.object({ fields: projectFieldsSchema }), permission: 'user' }, async ({ fields }, user) => {
  assertOwnImages(fields, null, user.id)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const project = await prisma.$transaction(async (tx) => {
        const p = await tx.project.create({
          data: { slug: withSuffix(slugify(fields.name), shortId()), ownerId: user.id, members: { create: { userId: user.id, role: 'owner' } } },
        })
        const v = await tx.projectVersion.create({ data: { projectId: p.id, number: 1, ...versionData(fields), createdById: user.id } })
        return tx.project.update({ where: { id: p.id }, data: { currentVersionId: v.id } })
      })
      await recordAudit({ actorId: user.id, action: 'project.create', entityType: 'Project', entityId: project.id, after: { name: fields.name } })
      revalidatePath('/projects')
      return { id: project.id, slug: project.slug }
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') continue // slug collision → new suffix
      throw err
    }
  }
  throw new ActionError('Could not create the project, try again')
})

/** Save edits into the project's draft (or a fresh draft if the latest version is sealed by a submission). */
export const saveProject = action(
  { schema: z.object({ projectId: z.string().min(1), fields: projectFieldsSchema }), permission: 'user' },
  async ({ projectId, fields }, user) => {
    await membership(projectId, user.id)
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: true } })
    if (!project || project.archivedAt || !project.currentVersion) throw new ActionError('Project not found')
    assertOwnImages(fields, projectId, user.id)
    const cur = project.currentVersion
    const plan = planSave(cur, versionChanged(fieldsOf(cur), fields))
    if (plan === 'noop') return { slug: project.slug, changed: false }
    await prisma.$transaction(async (tx) => {
      if (plan === 'update-draft') {
        // sealedAt: null guard — if a submission sealed it meanwhile, fall through to a new draft.
        const r = await tx.projectVersion.updateMany({ where: { id: cur.id, sealedAt: null }, data: { ...versionData(fields), createdById: user.id } })
        if (r.count) return
      }
      const last = await tx.projectVersion.aggregate({ where: { projectId }, _max: { number: true } })
      const draft = await tx.projectVersion.create({ data: { projectId, number: (last._max.number ?? 0) + 1, ...versionData(fields), createdById: user.id } })
      await tx.project.update({ where: { id: projectId }, data: { currentVersionId: draft.id } })
    })
    await recordAudit({ actorId: user.id, action: 'project.update', entityType: 'Project', entityId: projectId, before: fieldsOf(cur), after: fields })
    revalidatePath(`/projects/${project.slug}`, 'layout')
    return { slug: project.slug, changed: true }
  },
)

export const inviteMember = action(
  { schema: z.object({ projectId: z.string().min(1), email: z.string().trim().toLowerCase().email('Enter a valid email') }), permission: 'user' },
  async ({ projectId, email }, user) => {
    await membership(projectId, user.id)
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: { select: { name: true } } } })
    if (!project || project.archivedAt) throw new ActionError('Project not found')
    const already = await prisma.projectMember.findFirst({ where: { projectId, user: { email } } })
    if (already) throw new ActionError('That person is already on the team') // never re-invite (no downgrades)
    const token = crypto.randomBytes(32).toString('base64url')
    await prisma.$transaction([
      prisma.projectInvite.updateMany({ where: { projectId, email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.projectInvite.create({ data: { projectId, email, tokenHash: hashToken(token), invitedById: user.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } }),
    ])
    const name = project.currentVersion?.name ?? 'a project'
    await sendMail({
      to: email,
      subject: `${user.name} invited you to ${name} on the team1 hub`,
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
    })
    await recordAudit({ actorId: user.id, action: 'project.invite.create', entityType: 'Project', entityId: projectId, after: { email } })
    revalidatePath(`/projects/${project.slug}`)
    return null
  },
)

export const revokeInvite = action({ schema: z.object({ inviteId: z.string().min(1) }), permission: 'user' }, async ({ inviteId }, user) => {
  const invite = await prisma.projectInvite.findUnique({ where: { id: inviteId }, include: { project: { select: { slug: true } } } })
  if (!invite) throw new ActionError('Invite not found')
  await membership(invite.projectId, user.id)
  await prisma.projectInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } })
  await recordAudit({ actorId: user.id, action: 'project.invite.revoke', entityType: 'Project', entityId: invite.projectId, before: { email: invite.email } })
  revalidatePath(`/projects/${invite.project.slug}`)
  return null
})

export const acceptInvite = action({ schema: z.object({ token: z.string().min(20).max(100) }), permission: 'user' }, async ({ token }, user) => {
  const invite = await prisma.projectInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { project: { select: { slug: true, archivedAt: true } } } })
  if (!invite || invite.revokedAt || invite.project.archivedAt) throw new ActionError('This invite is no longer valid')
  if (invite.acceptedAt) throw new ActionError('This invite was already used')
  if (invite.expiresAt < new Date()) throw new ActionError('This invite has expired — ask the team for a new one')
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } })
  if (!me?.emailVerified || me.email.toLowerCase() !== invite.email) {
    throw new ActionError(`This invite is for ${invite.email}. Sign in with that email to accept it.`)
  }
  // A submitted team can't grow past its hackathon's limit, and nobody may end up on two submissions of one hackathon.
  const running = await prisma.submission.findMany({
    where: { projectId: invite.projectId, status: 'active', hackathon: { stages: { some: { judgingClosedAt: null } } } },
    include: { hackathon: { select: { id: true, teamSizeMax: true, event: { select: { name: true } } } }, project: { select: { _count: { select: { members: true } } } } },
  })
  for (const s of running) {
    if (s.project._count.members + 1 > s.hackathon.teamSizeMax) throw new ActionError(`This team is at the ${s.hackathon.event.name} size limit (${s.hackathon.teamSizeMax})`)
    const other = await prisma.submission.findFirst({ where: { hackathonId: s.hackathon.id, status: 'active', projectId: { not: invite.projectId }, project: { members: { some: { userId: user.id } } } } })
    if (other) throw new ActionError(`You're already on another team in ${s.hackathon.event.name}`)
  }
  await prisma.$transaction([
    prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
      create: { projectId: invite.projectId, userId: user.id, role: 'member' },
      update: {}, // already a member: keep their role
    }),
    prisma.projectInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ])
  await recordAudit({ actorId: user.id, action: 'project.member.join', entityType: 'Project', entityId: invite.projectId })
  revalidatePath('/projects', 'layout')
  return { slug: invite.project.slug }
})

export const removeMember = action(
  { schema: z.object({ projectId: z.string().min(1), userId: z.string().min(1) }), permission: 'user' },
  async ({ projectId, userId }, user) => {
    const me = await membership(projectId, user.id)
    const leaving = userId === user.id
    if (!leaving && me.role !== 'owner') throw new ActionError('Only the owner can remove team members')
    const target = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
    if (!target) throw new ActionError('Not on this team')
    if (target.role === 'owner') throw new ActionError(leaving ? 'Transfer ownership before you leave' : 'The owner cannot be removed')
    await prisma.projectMember.delete({ where: { id: target.id } })
    await recordAudit({ actorId: user.id, action: leaving ? 'project.member.leave' : 'project.member.remove', entityType: 'Project', entityId: projectId, before: { userId } })
    revalidatePath('/projects', 'layout')
    return null
  },
)

export const transferOwnership = action(
  { schema: z.object({ projectId: z.string().min(1), userId: z.string().min(1) }), permission: 'user' },
  async ({ projectId, userId }, user) => {
    const me = await membership(projectId, user.id)
    if (me.role !== 'owner') throw new ActionError('Only the owner can transfer ownership')
    await membership(projectId, userId).catch(() => {
      throw new ActionError('The new owner must be on the team')
    })
    await prisma.$transaction([
      prisma.projectMember.update({ where: { projectId_userId: { projectId, userId: user.id } }, data: { role: 'member' } }),
      prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: 'owner' } }),
      prisma.project.update({ where: { id: projectId }, data: { ownerId: userId } }),
    ])
    await recordAudit({ actorId: user.id, action: 'project.owner.transfer', entityType: 'Project', entityId: projectId, before: { ownerId: user.id }, after: { ownerId: userId } })
    revalidatePath('/projects', 'layout')
    return null
  },
)
