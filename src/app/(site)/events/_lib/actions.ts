'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { getPortalProfile } from '@/lib/member-portal'
import type { CurrentUser } from '@/lib/session'
import { canManageEvents } from './access'
import { LumaError, parseLumaRef } from './luma'
import { BLOCKS_PUBLISH_MESSAGE, blocksPublish, PortalEventError } from './portal'
import { refreshEventFromSource, upsertEvent } from './sync'

// permission 'user' + assertEvents: events.manage OR hackathons.manage (see access.ts).
function assertEvents(user: CurrentUser) {
  if (!canManageEvents(user)) throw new ActionError('Forbidden')
}

export const importEvent = action(
  {
    schema: z.object({ ref: z.string().trim().min(1, 'Paste a Luma link').max(300), source: z.enum(['luma', 'portal']).default('luma') }),
    permission: 'user',
  },
  async ({ ref, source }, user) => {
    assertEvents(user)
    // team1 events (the portal tab) are for team1 members only
    if (source === 'portal' && !(await getPortalProfile(user.id))?.tier) throw new ActionError('team1 events are only available to team1 members')
    const parsed = source === 'portal' ? (/^evt-[A-Za-z0-9]{1,100}$/.test(ref) ? ref : null) : parseLumaRef(ref)
    if (!parsed) throw new ActionError(source === 'portal' ? 'Not a team1 event' : 'Not a Luma event link - it should look like https://luma.com/abc123')
    try {
      const { event, created } = await upsertEvent(parsed, source, user.id)
      if (created) await recordAudit({ actorId: user.id, action: 'event.import', entityType: 'Event', entityId: event.id, after: { lumaEventId: event.lumaEventId, name: event.name, source } })
      revalidatePath('/admin/events')
      return { id: event.id, created }
    } catch (err) {
      if (err instanceof LumaError || err instanceof PortalEventError) throw new ActionError(err.message)
      throw err
    }
  },
)

export const setEventStatus = action(
  { schema: z.object({ id: z.string().min(1), status: z.enum(['draft', 'published', 'archived']) }), permission: 'user' },
  async ({ id, status }, user) => {
    assertEvents(user)
    const before = await prisma.event.findUnique({ where: { id }, select: { status: true, slug: true, source: true, lumaVisibility: true } })
    if (!before) throw new ActionError('Event not found')
    if (status === 'published' && blocksPublish(before)) throw new ActionError(BLOCKS_PUBLISH_MESSAGE)
    await prisma.event.update({ where: { id }, data: { status } })
    await recordAudit({ actorId: user.id, action: 'event.status.set', entityType: 'Event', entityId: id, before: { status: before.status }, after: { status } })
    revalidatePath('/admin/events', 'layout')
    revalidatePath('/events', 'layout')
    return null
  },
)

export const refreshEvent = action({ schema: z.object({ id: z.string().min(1) }), permission: 'user' }, async ({ id }, user) => {
  assertEvents(user)
  const res = await refreshEventFromSource(id)
  revalidatePath('/admin/events', 'layout')
  revalidatePath('/events', 'layout')
  if (!res.ok) throw new ActionError(res.error ?? 'Refresh failed')
  return null
})

export const deleteEvent = action({ schema: z.object({ id: z.string().min(1) }), permission: 'superAdmin' }, async ({ id }, user) => {
  const before = await prisma.event.findUnique({ where: { id }, select: { lumaEventId: true, name: true, source: true, status: true, hackathon: { select: { id: true } } } })
  if (!before) throw new ActionError('Event not found')
  if (before.hackathon) throw new ActionError('This event is a hackathon - it can’t be deleted')
  await prisma.event.delete({ where: { id } })
  const { hackathon: _, ...snapshot } = before
  await recordAudit({ actorId: user.id, action: 'event.delete', entityType: 'Event', entityId: id, before: snapshot })
  revalidatePath('/admin/events', 'layout')
  revalidatePath('/events', 'layout')
  return null
})
