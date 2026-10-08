// No server-only import: the worker (events-refresh job) uses this module outside Next.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { shortId, slugify, withSuffix } from '@/lib/slug'
import { fetchLumaEvent, type LumaEventData } from './luma'
import { fetchPortalEvent } from './portal'

// Writing event data into Event rows. Shared by the import action, "refresh now"
// and the daily job. Each event refreshes from the source it was imported from.

export type EventSource = 'luma' | 'portal'

const fetchers: Record<EventSource, (ref: string) => Promise<LumaEventData>> = { luma: fetchLumaEvent, portal: fetchPortalEvent }

function lumaFields(e: LumaEventData) {
  const { lumaEventId: _id, ...fields } = e
  return fields
}

/** Create the hub event, or update the existing one (import is idempotent; a re-import switches its source). */
export async function upsertEvent(ref: string, source: EventSource, createdById: string) {
  const data = await fetchers[source](ref)
  const existing = await prisma.event.findUnique({ where: { lumaEventId: data.lumaEventId } })
  if (existing) {
    const updated = await prisma.event.update({ where: { id: existing.id }, data: { ...lumaFields(data), source, lastSyncedAt: new Date(), syncError: null } })
    return { event: updated, created: false }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const event = await prisma.event.create({
        data: { ...data, source, slug: withSuffix(slugify(data.name), shortId()), createdById, lastSyncedAt: new Date() },
      })
      return { event, created: true }
    } catch (err) {
      // slug collision → new suffix; lumaEventId race → the other import won
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 3) {
        const raced = await prisma.event.findUnique({ where: { lumaEventId: data.lumaEventId } })
        if (raced) return { event: raced, created: false }
        continue
      }
      throw err
    }
  }
}

/** Re-fetch one event from its source; records the error on the row instead of throwing. */
export async function refreshEventFromSource(id: string): Promise<{ ok: boolean; error?: string }> {
  const event = await prisma.event.findUnique({ where: { id }, select: { lumaEventId: true, source: true } })
  if (!event) return { ok: false, error: 'Event not found' }
  try {
    const data = await fetchers[event.source === 'portal' ? 'portal' : 'luma'](event.lumaEventId)
    await prisma.event.update({ where: { id }, data: { ...lumaFields(data), lastSyncedAt: new Date(), syncError: null } })
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.event.update({ where: { id }, data: { syncError: error } })
    return { ok: false, error }
  }
}
