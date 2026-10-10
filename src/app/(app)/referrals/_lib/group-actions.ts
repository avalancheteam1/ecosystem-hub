'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { roleSlugSchema } from '@/lib/access'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

const fields = {
  name: z.string().trim().min(1, 'Name is required').max(80),
  slug: roleSlugSchema,
}
const conflict = (err: unknown) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ActionError('This slug is already used by another group')
  throw err
}
// Not exported: a 'use server' file may only export action()s.
async function assertManualGroup(id: string) {
  const g = await prisma.group.findUnique({ where: { id }, select: { portalChapterSlug: true } })
  if (!g) throw new ActionError('Group not found')
  if (g.portalChapterSlug) throw new ActionError('Chapter groups are managed in the member portal')
}
const done = (id?: string) => {
  revalidatePath('/admin/groups')
  if (id) revalidatePath(`/admin/groups/${id}`)
}

export const createGroup = action({ schema: z.object(fields), permission: 'groups.manage' }, async (input, user) => {
  const group = await prisma.group.create({ data: input }).catch(conflict)
  await recordAudit({ actorId: user.id, action: 'group.create', entityType: 'Group', entityId: group.id, after: input })
  done()
  return { id: group.id }
})

export const updateGroup = action({ schema: z.object({ id: z.string().min(1), ...fields }), permission: 'groups.manage' }, async ({ id, ...data }, user) => {
  await assertManualGroup(id)
  const before = await prisma.group.findUnique({ where: { id }, select: { name: true, slug: true } })
  if (!before) throw new ActionError('Group not found')
  await prisma.group.update({ where: { id }, data }).catch(conflict)
  await recordAudit({ actorId: user.id, action: 'group.update', entityType: 'Group', entityId: id, before, after: data })
  done(id)
  return null
})

export const deleteGroup = action({ schema: z.object({ id: z.string().min(1) }), permission: 'groups.manage' }, async ({ id }, user) => {
  await assertManualGroup(id)
  const before = await prisma.group.findUnique({ where: { id }, select: { name: true, slug: true, _count: { select: { members: true, referrals: true } } } })
  if (!before) throw new ActionError('Group not found')
  await prisma.group.delete({ where: { id } }) // cascades manual members + snapshot rows
  await recordAudit({ actorId: user.id, action: 'group.delete', entityType: 'Group', entityId: id, before })
  done()
  return null
})

export const addGroupMember = action(
  { schema: z.object({ groupId: z.string().min(1), email: z.email().transform((e) => e.trim().toLowerCase()), isLead: z.boolean() }), permission: 'groups.manage' },
  async ({ groupId, email, isLead }, user) => {
    await assertManualGroup(groupId)
    const target = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    if (!target) throw new ActionError('No hub user with this email - they need to sign up first')
    try {
      await prisma.groupMember.create({ data: { groupId, userId: target.id, isLead } })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ActionError('Already a member')
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new ActionError('Group not found')
      throw err
    }
    await recordAudit({ actorId: user.id, action: 'groupMember.add', entityType: 'Group', entityId: groupId, after: { userId: target.id, isLead } })
    done(groupId)
    return null
  },
)

export const setGroupLead = action(
  { schema: z.object({ groupId: z.string().min(1), userId: z.string().min(1), isLead: z.boolean() }), permission: 'groups.manage' },
  async ({ groupId, userId, isLead }, user) => {
    await assertManualGroup(groupId)
    const current = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { isLead: true } })
    if (!current) throw new ActionError('Not a member')
    await prisma.groupMember.update({ where: { groupId_userId: { groupId, userId } }, data: { isLead } })
    await recordAudit({ actorId: user.id, action: 'groupMember.update', entityType: 'Group', entityId: groupId, before: { userId, isLead: current.isLead }, after: { userId, isLead } })
    done(groupId)
    return null
  },
)

export const removeGroupMember = action(
  { schema: z.object({ groupId: z.string().min(1), userId: z.string().min(1) }), permission: 'groups.manage' },
  async ({ groupId, userId }, user) => {
    await assertManualGroup(groupId)
    const { count } = await prisma.groupMember.deleteMany({ where: { groupId, userId } })
    if (!count) throw new ActionError('Not a member')
    await recordAudit({ actorId: user.id, action: 'groupMember.remove', entityType: 'Group', entityId: groupId, before: { userId } })
    done(groupId)
    return null
  },
)
