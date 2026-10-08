// No server-only import: the worker (events-refresh job) uses this module outside Next.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { shortId, slugify, withSuffix } from '@/lib/slug'
import { fetchLumaEvent, type LumaEventData } from './luma'

// Writing Luma data into Event rows. Shared by the import action, "refresh now"
// and the daily job.

function lumaFields(e: LumaEventData) {
  const { lumaEventId: _id, ...fields } = e
  return fields
}

/** Create the hub event for a Luma event, or return the existing one (import is idempotent). */
export async function upsertEventFromLuma(ref: string, createdById: string) {
  const data = await fetchLumaEvent(ref)
  const existing = await prisma.event.findUnique({ where: { lumaEventId: data.lumaEventId } })
  if (existing) {
    const updated = await prisma.event.update({ where: { id: existing.id }, data: { ...lumaFields(data), lastSyncedAt: new Date(), syncError: null } })
    return { event: updated, created: false }
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const event = await prisma.event.create({
        data: { ...data, slug: withSuffix(slugify(data.name), shortId()), createdById, lastSyncedAt: new Date() },
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

/** Re-fetch one event; records the error on the row instead of throwing. */
export async function refreshEventFromLuma(id: string): Promise<{ ok: boolean; error?: string }> {
  const event = await prisma.event.findUnique({ where: { id }, select: { lumaEventId: true } })
  if (!event) return { ok: false, error: 'Event not found' }
  try {
    const data = await fetchLumaEvent(event.lumaEventId)
    await prisma.event.update({ where: { id }, data: { ...lumaFields(data), lastSyncedAt: new Date(), syncError: null } })
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await prisma.event.update({ where: { id }, data: { syncError: error } })
    return { ok: false, error }
  }
}
