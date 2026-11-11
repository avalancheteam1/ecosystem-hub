'use server'

import { logger } from '@/lib/logger'
import { z } from 'zod'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { IMAGE_KIND_KEYS, IMAGE_KINDS, type ImageKind } from '@/lib/image-kinds'
import { validateImageBuffer } from '@/lib/image-upload'
import { getStorage, storageKey } from '@/lib/storage'
import { canManageHackathon } from '@/app/(site)/events/_lib/hackathons/rules'
import { canEditProject } from '@/app/(app)/projects/_lib/rules'
import type { CurrentUser } from '@/lib/session'

// One upload endpoint for every image kind. The returned URL is then saved by
// the owning form, whose action checks it is an own upload (isOwnUpload).
// Orphans (a cancelled form) stay in the bucket - harmless, unguessable keys.

/** The owner id the key is filed under; throws unless the user may upload for it. */
async function authorizeOwner(kind: ImageKind, ownerId: string, user: CurrentUser): Promise<string> {
  switch (kind) {
    case 'avatar':
      return user.id
    case 'project-logo':
    case 'project-cover':
    case 'project-screenshot': {
      if (ownerId === 'new') return `new-${user.id}` // before the project exists; re-checked on save
      const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: ownerId, userId: user.id } } })
      if (!m || !canEditProject(m.role)) throw new ForbiddenError('You can’t edit this project')
      return ownerId
    }
    case 'sponsor-logo': {
      const h = await prisma.hackathon.findUnique({ where: { id: ownerId }, include: { organizers: { select: { userId: true } } } })
      if (!h || !canManageHackathon(user, h.organizers)) throw new ForbiddenError('Forbidden')
      return ownerId
    }
  }
}

export const uploadImage = action({ schema: z.instanceof(FormData), permission: 'user' }, async (form, user) => {
  const kind = z.enum(IMAGE_KIND_KEYS).safeParse(form.get('kind'))
  const ownerId = z.string().min(1).max(60).safeParse(form.get('ownerId'))
  const file = form.get('file')
  if (!kind.success || !ownerId.success || !(file instanceof File)) throw new ActionError('Invalid upload')
  const rules = IMAGE_KINDS[kind.data]
  if (file.size > rules.maxBytes) throw new ActionError(`Image must be smaller than ${rules.maxBytes / 1_000_000} MB`)
  const owner = await authorizeOwner(kind.data, ownerId.data, user)
  const buf = Buffer.from(await file.arrayBuffer())
  const checked = validateImageBuffer(buf, rules)
  if (!checked.ok) throw new ActionError(checked.error)
  const key = storageKey(rules.category, owner, checked.extension)
  let storage
  try {
    storage = getStorage()
    await storage.put({ key, body: buf, contentType: checked.contentType })
  } catch (err) {
    logger.error({ err }, '[upload] failed')
    throw new ActionError('Upload failed - try again')
  }
  await recordAudit({ actorId: user.id, action: 'image.upload', entityType: kind.data, entityId: owner, after: { key } })
  return { url: storage.publicUrl(key) }
})
