'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { generateApiKey } from '@/lib/api-keys'
import { isApiScope } from '@/lib/api-scopes'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

// Never put the key or its hash into the audit log.

const scopesSchema = z
  .array(z.string())
  .min(1, 'Pick at least one scope')
  .refine((s) => s.every(isApiScope), 'Unknown scope')
  .transform((s) => [...new Set(s)])

export const createApiKey = action(
  { schema: z.object({ name: z.string().trim().min(1, 'Name is required').max(80), scopes: scopesSchema }), permission: 'superAdmin' },
  async ({ name, scopes }, user) => {
    const { key, prefix, keyHash } = generateApiKey()
    const row = await prisma.apiKey.create({ data: { name, scopes, prefix, keyHash, createdById: user.id } })
    await recordAudit({ actorId: user.id, action: 'apiKey.create', entityType: 'ApiKey', entityId: row.id, after: { name, scopes, prefix } })
    revalidatePath('/admin/api-keys')
    return { key } // shown once
  },
)

export const updateApiKey = action(
  { schema: z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80), scopes: scopesSchema }), permission: 'superAdmin' },
  async ({ id, ...data }, user) => {
    const before = await prisma.apiKey.findUnique({ where: { id }, select: { name: true, scopes: true, revokedAt: true } })
    if (!before) throw new ActionError('Key not found')
    if (before.revokedAt) throw new ActionError('Revoked keys cannot be edited')
    await prisma.apiKey.update({ where: { id }, data })
    await recordAudit({ actorId: user.id, action: 'apiKey.update', entityType: 'ApiKey', entityId: id, before: { name: before.name, scopes: before.scopes }, after: data })
    revalidatePath('/admin/api-keys')
    return null
  },
)

export const revokeApiKey = action({ schema: z.object({ id: z.string().min(1) }), permission: 'superAdmin' }, async ({ id }, user) => {
  const res = await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } })
  if (res.count === 0) throw new ActionError('Key not found or already revoked')
  await recordAudit({ actorId: user.id, action: 'apiKey.revoke', entityType: 'ApiKey', entityId: id })
  revalidatePath('/admin/api-keys')
  return null
})
