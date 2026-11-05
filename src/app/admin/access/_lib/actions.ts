'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertMaySetSuperAdmin, permissionListSchema, roleSlugSchema } from '@/lib/access'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

// Everything here is super-admin-only: roles, grants and super admins are not
// grantable powers (see AGENTS.md "Authorization model").

async function assertUserExists(id: string) {
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw new ActionError('User not found')
}

const roleFields = {
  label: z.string().trim().min(1, 'Label is required').max(60),
  description: z.string().trim().max(300).optional().transform((v) => v || null),
  permissions: permissionListSchema,
}

export const createRole = action(
  { schema: z.object({ slug: roleSlugSchema, ...roleFields }), permission: 'superAdmin' },
  async (input, user) => {
    try {
      const role = await prisma.role.create({ data: input })
      await recordAudit({ actorId: user.id, action: 'role.create', entityType: 'Role', entityId: role.id, after: input })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ActionError('A role with this slug already exists')
      throw err
    }
    revalidatePath('/admin/access')
    return null
  },
)

export const updateRole = action(
  { schema: z.object({ id: z.string().min(1), ...roleFields }), permission: 'superAdmin' },
  async ({ id, ...data }, user) => {
    const before = await prisma.role.findUnique({ where: { id }, select: { label: true, description: true, permissions: true } })
    if (!before) throw new ActionError('Role not found')
    await prisma.role.update({ where: { id }, data })
    await recordAudit({ actorId: user.id, action: 'role.update', entityType: 'Role', entityId: id, before, after: data })
    revalidatePath('/admin/access', 'layout')
    return null
  },
)

export const deleteRole = action(
  { schema: z.object({ id: z.string().min(1) }), permission: 'superAdmin' },
  async ({ id }, user) => {
    const before = await prisma.role.findUnique({ where: { id }, select: { slug: true, label: true, permissions: true, _count: { select: { users: true } } } })
    if (!before) throw new ActionError('Role not found')
    await prisma.role.delete({ where: { id } }) // cascades UserRole rows
    await recordAudit({ actorId: user.id, action: 'role.delete', entityType: 'Role', entityId: id, before })
    revalidatePath('/admin/access', 'layout')
    return null
  },
)

export const setSuperAdmin = action(
  { schema: z.object({ userId: z.string().min(1), value: z.boolean() }), permission: 'superAdmin' },
  async ({ userId, value }, user) => {
    assertMaySetSuperAdmin(user.id, userId, value)
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } })
    if (!before) throw new ActionError('User not found')
    await prisma.user.update({ where: { id: userId }, data: { isSuperAdmin: value } })
    await recordAudit({ actorId: user.id, action: 'user.superAdmin.set', entityType: 'User', entityId: userId, before, after: { isSuperAdmin: value } })
    revalidatePath(`/admin/access/users/${userId}`)
    return null
  },
)

/** Recovery: someone lost every passkey and their authenticator app. Removes all of them and signs the user out everywhere. */
export const resetSecondFactor = action(
  { schema: z.object({ userId: z.string().min(1) }), permission: 'superAdmin' },
  async ({ userId }, user) => {
    const before = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, _count: { select: { passkeys: true } } } })
    if (!before) throw new ActionError('User not found')
    await prisma.$transaction([
      prisma.passkey.deleteMany({ where: { userId } }),
      prisma.twoFactor.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
      prisma.session.deleteMany({ where: { userId } }),
    ])
    await recordAudit({ actorId: user.id, action: 'user.secondFactor.reset', entityType: 'User', entityId: userId, before: { twoFactorEnabled: before.twoFactorEnabled, passkeys: before._count.passkeys }, after: { twoFactorEnabled: false, passkeys: 0 } })
    revalidatePath(`/admin/access/users/${userId}`)
    return null
  },
)

export const setUserRoles = action(
  { schema: z.object({ userId: z.string().min(1), roleIds: z.array(z.string().min(1)).transform((ids) => [...new Set(ids)]) }), permission: 'superAdmin' },
  async ({ userId, roleIds }, user) => {
    await assertUserExists(userId)
    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true } })
    if (roles.length !== roleIds.length) throw new ActionError('Unknown role')
    const before = (await prisma.userRole.findMany({ where: { userId }, select: { roleId: true } })).map((r) => r.roleId).sort()
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId, roleId: { notIn: roleIds } } }),
      prisma.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId, grantedById: user.id })), skipDuplicates: true }),
    ])
    await recordAudit({ actorId: user.id, action: 'user.roles.set', entityType: 'User', entityId: userId, before: { roleIds: before }, after: { roleIds: [...roleIds].sort() } })
    revalidatePath(`/admin/access/users/${userId}`)
    return null
  },
)

export const setUserPermissions = action(
  { schema: z.object({ userId: z.string().min(1), permissions: permissionListSchema }), permission: 'superAdmin' },
  async ({ userId, permissions }, user) => {
    await assertUserExists(userId)
    const before = (await prisma.userPermission.findMany({ where: { userId }, select: { permission: true } })).map((p) => p.permission).sort()
    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId, permission: { notIn: permissions } } }),
      prisma.userPermission.createMany({ data: permissions.map((permission) => ({ userId, permission, grantedById: user.id })), skipDuplicates: true }),
    ])
    await recordAudit({ actorId: user.id, action: 'user.permissions.set', entityType: 'User', entityId: userId, before: { permissions: before }, after: { permissions: [...permissions].sort() } })
    revalidatePath(`/admin/access/users/${userId}`)
    return null
  },
)
