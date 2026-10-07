'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'

export const updateProfile = action(
  { schema: z.object({ name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long') }), permission: 'user' },
  async ({ name }, user) => {
    await prisma.user.update({ where: { id: user.id }, data: { name } })
    await recordAudit({ actorId: user.id, action: 'user.profile.update', entityType: 'User', entityId: user.id, before: { name: user.name }, after: { name } })
    revalidatePath('/', 'layout')
    return null
  },
)
