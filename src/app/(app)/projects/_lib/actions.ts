'use server'

import { logger } from '@/lib/logger'
import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, button, CELL, esc, PARA, SMALL } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { rateLimit } from '@/lib/rate-limit'
import { shortId, slugify, withSuffix } from '@/lib/slug'
import { isOwnUpload } from '@/lib/storage'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { ASSIGNABLE_ROLES, canEditProject, canManageTeam, fieldsOf, MAX_MILESTONES, milestoneDoneAt, planSave, TEAM_ROLES, versionChanged } from './rules'
import { milestoneSchema, projectFieldsSchema, type ProjectFields } from './schemas'

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const INVITE_DAYS = 14
// Invites mail any address from our domain - caps keep that from becoming a spam/phishing relay.
const MAX_OPEN_INVITES = 20
const INVITES_PER_HOUR = 20
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex')

async function membership(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!m) throw new ForbiddenError('You are not on this project')
  return m
}

async function requireWriter(projectId: string, userId: string) {
  const m = await membership(projectId, userId)
  if (!canEditProject(m.role)) throw new ForbiddenError('You can only view this project')
  return m
}

async function requireOwner(projectId: string, userId: string) {
  const m = await membership(projectId, userId)
  if (!canManageTeam(m.role)) throw new ForbiddenError('Only the owner can manage the team')
  return m
}

/** A submitted team can't grow past its hackathon's limit, and (unless allowed) nobody may end up on two submissions of one hackathon. */
async function assertCanJoinTeam(projectId: string, userId: string) {
  const running = await prisma.submission.findMany({
    where: { projectId, status: 'active', hackathon: { stages: { some: { judgingClosedAt: null } } } },
    include: { hackathon: { select: { id: true, teamSizeMax: true, allowMultipleSubmissions: true, event: { select: { name: true } } } }, project: { select: { _count: { select: { members: { where: { role: { in: TEAM_ROLES } } } } } } } },
  })
  for (const s of running) {
    if (s.hackathon.teamSizeMax != null && s.project._count.members + 1 > s.hackathon.teamSizeMax) throw new ActionError(`This team is at the ${s.hackathon.event.name} size limit (${s.hackathon.teamSizeMax})`)
    if (s.hackathon.allowMultipleSubmissions) continue
    const other = await prisma.submission.findFirst({ where: { hackathonId: s.hackathon.id, status: 'active', projectId: { not: projectId }, project: { members: { some: { userId, role: { in: TEAM_ROLES } } } } } })
    if (other) throw new ActionError(`Already on another team in ${s.hackathon.event.name}`)
  }
}

function versionData(f: ProjectFields) {
  return { ...f, deployedAddresses: f.deployedAddresses as object[], websites: f.websites as object[], socials: f.socials as object[] }
}

/** Images must be our own uploads for this project (or this user's pre-create uploads) - no hotlinked URLs. */
function assertOwnImages(f: ProjectFields, projectId: string | null, userId: string) {
  const owners = [`new-${userId}`, ...(projectId ? [projectId] : [])]
  const own = (url: string, kind: 'project-logo' | 'project-cover' | 'project-screenshot') => owners.some((o) => isOwnUpload(url, IMAGE_KINDS[kind].category, o))
  if (f.logoUrl && !own(f.logoUrl, 'project-logo')) throw new ActionError('Upload the logo here')
  if (f.coverUrl && !own(f.coverUrl, 'project-cover')) throw new ActionError('Upload the cover image here')
  if (f.screenshots.some((u) => !own(u, 'project-screenshot'))) throw new ActionError('Upload screenshots here')
}

export const createProject = action({ schema: z.object({ fields: projectFieldsSchema, milestones: z.array(milestoneSchema).max(MAX_MILESTONES).default([]) }), permission: 'user' }, async ({ fields, milestones }, user) => {
  assertOwnImages(fields, null, user.id)
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const project = await prisma.$transaction(async (tx) => {
        const p = await tx.project.create({
          data: {
            slug: withSuffix(slugify(fields.name), shortId()),
            ownerId: user.id,
            members: { create: { userId: user.id, role: 'owner' } },
            milestones: { create: milestones.map((m) => ({ ...m, doneAt: milestoneDoneAt(null, m.status, new Date()) })) },
          },
        })
        const v = await tx.projectVersion.create({ data: { projectId: p.id, number: 1, ...versionData(fields), createdById: user.id } })
        return tx.project.update({ where: { id: p.id }, data: { currentVersionId: v.id } })
      })
      await recordAudit({ actorId: user.id, action: 'project.create', entityType: 'Project', entityId: project.id, after: { name: fields.name, milestones: milestones.length } })
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
    await requireWriter(projectId, user.id)
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: true } })
    if (!project || project.archivedAt || !project.currentVersion) throw new ActionError('Project not found')
    assertOwnImages(fields, projectId, user.id)
    const cur = project.currentVersion
    const plan = planSave(cur, versionChanged(fieldsOf(cur), fields))
    if (plan === 'noop') return { slug: project.slug, changed: false }
    await prisma.$transaction(async (tx) => {
      if (plan === 'update-draft') {
        // sealedAt: null guard - if a submission sealed it meanwhile, fall through to a new draft.
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

// ── Milestones: live list, writers and the owner edit ───────────────────────

async function editableProject(projectId: string, userId: string) {
  await requireWriter(projectId, userId)
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { slug: true, archivedAt: true } })
  if (!project || project.archivedAt) throw new ActionError('Project not found')
  return project
}

export const addMilestone = action({ schema: milestoneSchema.extend({ projectId: z.string().min(1) }), permission: 'user' }, async ({ projectId, ...m }, user) => {
  const project = await editableProject(projectId, user.id)
  if ((await prisma.projectMilestone.count({ where: { projectId } })) >= MAX_MILESTONES) throw new ActionError(`At most ${MAX_MILESTONES} milestones`)
  const row = await prisma.projectMilestone.create({ data: { projectId, ...m, doneAt: milestoneDoneAt(null, m.status, new Date()) } })
  await recordAudit({ actorId: user.id, action: 'project.milestone.add', entityType: 'ProjectMilestone', entityId: row.id, after: m })
  revalidatePath(`/projects/${project.slug}`)
  return { id: row.id }
})

export const updateMilestone = action({ schema: milestoneSchema.extend({ id: z.string().min(1) }), permission: 'user' }, async ({ id, ...m }, user) => {
  const cur = await prisma.projectMilestone.findUnique({ where: { id } })
  if (!cur) throw new ActionError('Milestone not found')
  const project = await editableProject(cur.projectId, user.id)
  await prisma.projectMilestone.update({ where: { id }, data: { ...m, doneAt: milestoneDoneAt(cur, m.status, new Date()) } })
  await recordAudit({ actorId: user.id, action: 'project.milestone.update', entityType: 'ProjectMilestone', entityId: id, before: { title: cur.title, description: cur.description, targetDate: cur.targetDate, status: cur.status }, after: m })
  revalidatePath(`/projects/${project.slug}`)
})

export const deleteMilestone = action({ schema: z.object({ id: z.string().min(1) }), permission: 'user' }, async ({ id }, user) => {
  const cur = await prisma.projectMilestone.findUnique({ where: { id } })
  if (!cur) throw new ActionError('Milestone not found')
  const project = await editableProject(cur.projectId, user.id)
  await prisma.projectMilestone.delete({ where: { id } })
  await recordAudit({ actorId: user.id, action: 'project.milestone.delete', entityType: 'ProjectMilestone', entityId: id, before: { title: cur.title, targetDate: cur.targetDate, status: cur.status } })
  revalidatePath(`/projects/${project.slug}`)
})

export const inviteMember = action(
  { schema: z.object({ projectId: z.string().min(1), email: z.string().trim().toLowerCase().email('Enter a valid email'), role: z.enum(ASSIGNABLE_ROLES) }), permission: 'user' },
  async ({ projectId, email, role }, user) => {
    await requireOwner(projectId, user.id)
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: { currentVersion: { select: { name: true } } } })
    if (!project || project.archivedAt) throw new ActionError('Project not found')
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
    await sendMail({
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
    await recordAudit({ actorId: user.id, action: 'project.invite.create', entityType: 'Project', entityId: projectId, after: { email, role } })
    revalidatePath(`/projects/${project.slug}`)
    return null
  },
)

export const revokeInvite = action({ schema: z.object({ inviteId: z.string().min(1) }), permission: 'user' }, async ({ inviteId }, user) => {
  const invite = await prisma.projectInvite.findUnique({ where: { id: inviteId }, include: { project: { select: { slug: true } } } })
  if (!invite) throw new ActionError('Invite not found')
  await requireOwner(invite.projectId, user.id)
  await prisma.projectInvite.update({ where: { id: inviteId }, data: { revokedAt: new Date() } })
  await recordAudit({ actorId: user.id, action: 'project.invite.revoke', entityType: 'Project', entityId: invite.projectId, before: { email: invite.email } })
  revalidatePath(`/projects/${invite.project.slug}`)
  return null
})

export const acceptInvite = action({ schema: z.object({ token: z.string().min(20).max(100) }), permission: 'user' }, async ({ token }, user) =>
  joinViaInvite(await prisma.projectInvite.findUnique({ where: { tokenHash: hashToken(token) }, include: { project: { select: { slug: true, archivedAt: true } } } }), user),
)

/** In-app accept (dashboard, projects list): the verified-email check below is what the emailed token proves too. */
export const acceptInviteById = action({ schema: z.object({ inviteId: z.string().min(1) }), permission: 'user' }, async ({ inviteId }, user) =>
  // Scoped to my own email, so a foreign invite id reveals nothing about who it was for.
  joinViaInvite(await prisma.projectInvite.findFirst({ where: { id: inviteId, email: user.email.toLowerCase() }, include: { project: { select: { slug: true, archivedAt: true } } } }), user),
)

type InviteRow = { id: string; projectId: string; email: string; role: string; acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date; project: { slug: string; archivedAt: Date | null } }

async function joinViaInvite(invite: InviteRow | null, user: { id: string }) {
  if (!invite || invite.revokedAt || invite.project.archivedAt) throw new ActionError('This invite is no longer valid')
  if (invite.acceptedAt) throw new ActionError('This invite was already used')
  if (invite.expiresAt < new Date()) throw new ActionError('This invite has expired - ask the team for a new one')
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } })
  if (!me?.emailVerified || me.email.toLowerCase() !== invite.email) {
    throw new ActionError(`This invite is for ${invite.email}. Sign in with that email to accept it.`)
  }
  if (canEditProject(invite.role)) await assertCanJoinTeam(invite.projectId, user.id) // readers aren't on the hackathon team
  await prisma.$transaction([
    prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
      create: { projectId: invite.projectId, userId: user.id, role: invite.role },
      update: {}, // already a member: keep their role
    }),
    prisma.projectInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ])
  await recordAudit({ actorId: user.id, action: 'project.member.join', entityType: 'Project', entityId: invite.projectId, after: { role: invite.role } })
  revalidatePath('/projects', 'layout')
  revalidatePath('/dashboard')
  return { slug: invite.project.slug }
}

export const removeMember = action(
  { schema: z.object({ projectId: z.string().min(1), userId: z.string().min(1) }), permission: 'user' },
  async ({ projectId, userId }, user) => {
    const me = await membership(projectId, user.id)
    const leaving = userId === user.id
    if (!leaving && !canManageTeam(me.role)) throw new ForbiddenError('Only the owner can remove team members')
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
    await requireOwner(projectId, user.id)
    const target = await membership(projectId, userId).catch(() => {
      throw new ActionError('The new owner must be on the team')
    })
    if (target.role === 'reader') await assertCanJoinTeam(projectId, userId)
    await prisma.$transaction([
      prisma.projectMember.update({ where: { projectId_userId: { projectId, userId: user.id } }, data: { role: 'writer' } }),
      prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: 'owner' } }),
      prisma.project.update({ where: { id: projectId }, data: { ownerId: userId } }),
    ])
    await recordAudit({ actorId: user.id, action: 'project.owner.transfer', entityType: 'Project', entityId: projectId, before: { ownerId: user.id }, after: { ownerId: userId } })
    revalidatePath('/projects', 'layout')
    return null
  },
)

export const setMemberRole = action(
  { schema: z.object({ projectId: z.string().min(1), userId: z.string().min(1), role: z.enum(ASSIGNABLE_ROLES) }), permission: 'user' },
  async ({ projectId, userId, role }, user) => {
    await requireOwner(projectId, user.id)
    const target = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
    if (!target) throw new ActionError('Not on this team')
    if (target.role === 'owner') throw new ActionError('Transfer ownership to change the owner')
    if (target.role === role) return null
    if (target.role === 'reader') await assertCanJoinTeam(projectId, userId) // joins the hackathon team
    await prisma.projectMember.update({ where: { id: target.id }, data: { role } })
    await recordAudit({ actorId: user.id, action: 'project.member.role', entityType: 'Project', entityId: projectId, before: { userId, role: target.role }, after: { userId, role } })
    revalidatePath('/projects', 'layout')
    return null
  },
)

/** Owner-only soft delete: sets archivedAt, which hides the project everywhere. Sealed versions and past submissions stay intact. */
export const deleteProject = action({ schema: z.object({ projectId: z.string().min(1) }), permission: 'user' }, async ({ projectId }, user) => {
  const m = await membership(projectId, user.id)
  if (!canManageTeam(m.role)) throw new ForbiddenError('Only the owner can delete the project')
  const running = await prisma.submission.count({ where: { projectId, status: 'active', hackathon: { resultsPublishedAt: null } } })
  if (running) throw new ActionError('This project is in a running hackathon - withdraw the submission first')
  const r = await prisma.project.updateMany({ where: { id: projectId, archivedAt: null }, data: { archivedAt: new Date() } })
  if (!r.count) throw new ActionError('Project not found')
  await prisma.projectInvite.updateMany({ where: { projectId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
  await recordAudit({ actorId: user.id, action: 'project.delete', entityType: 'Project', entityId: projectId, before: { archivedAt: null }, after: { archivedAt: true } })
  revalidatePath('/projects', 'layout')
  revalidatePath('/dashboard')
  return null
})
