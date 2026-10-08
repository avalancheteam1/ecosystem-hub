'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { LumaError, parseLumaRef } from './luma'
import { refreshEventFromLuma, upsertEventFromLuma } from './sync'

export const importEvent = action(
  { schema: z.object({ ref: z.string().trim().min(1, 'Paste a Luma link').max(300) }), permission: 'hackathons.manage' },
  async ({ ref }, user) => {
    const parsed = parseLumaRef(ref)
    if (!parsed) throw new ActionError('Not a Luma event link — it should look like https://luma.com/abc123')
    try {
      const { event, created } = await upsertEventFromLuma(parsed, user.id)
      if (created) await recordAudit({ actorId: user.id, action: 'event.import', entityType: 'Event', entityId: event.id, after: { lumaEventId: event.lumaEventId, name: event.name } })
      revalidatePath('/admin/events')
      return { id: event.id, created }
    } catch (err) {
      if (err instanceof LumaError) throw new ActionError(err.message)
      throw err
    }
  },
)

export const setEventStatus = action(
  { schema: z.object({ id: z.string().min(1), status: z.enum(['draft', 'published', 'archived']) }), permission: 'hackathons.manage' },
  async ({ id, status }, user) => {
    const before = await prisma.event.findUnique({ where: { id }, select: { status: true, slug: true } })
    if (!before) throw new ActionError('Event not found')
    await prisma.event.update({ where: { id }, data: { status } })
    await recordAudit({ actorId: user.id, action: 'event.status.set', entityType: 'Event', entityId: id, before: { status: before.status }, after: { status } })
    revalidatePath('/admin/events', 'layout')
    revalidatePath('/events', 'layout')
    return null
  },
)

export const refreshEvent = action({ schema: z.object({ id: z.string().min(1) }), permission: 'hackathons.manage' }, async ({ id }) => {
  const res = await refreshEventFromLuma(id)
  revalidatePath('/admin/events', 'layout')
  revalidatePath('/events', 'layout')
  if (!res.ok) throw new ActionError(res.error ?? 'Refresh failed')
  return null
})
