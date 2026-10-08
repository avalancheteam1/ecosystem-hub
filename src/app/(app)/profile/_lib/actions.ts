'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { IMAGE_KINDS } from '@/lib/image-kinds'
import { profileSchema } from '@/lib/profile'
import { isOwnUpload } from '@/lib/storage'

export const saveProfile = action({ schema: profileSchema, permission: 'user' }, async (input, user) => {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { image: true, name: true, username: true, country: true, builderRoles: true } })
  // Avatar: keep the current one (e.g. from Google/GitHub), or an own upload.
  if (input.image && input.image !== before.image && !isOwnUpload(input.image, IMAGE_KINDS.avatar.category, user.id)) throw new ActionError('Upload your avatar here')
  try {
    await prisma.user.update({ where: { id: user.id }, data: input })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ActionError('That username is taken')
    throw err
  }
  await recordAudit({ actorId: user.id, action: 'user.profile.update', entityType: 'User', entityId: user.id, before, after: { image: input.image, name: input.name, username: input.username, country: input.country, builderRoles: input.builderRoles } })
  revalidatePath('/', 'layout')
  return null
})
