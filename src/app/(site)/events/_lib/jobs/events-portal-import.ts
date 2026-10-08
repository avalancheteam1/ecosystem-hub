import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { Job } from '@/lib/jobs'
import { listPortalEvents } from '../portal'
import { upsertEvent } from '../sync'

/**
 * Hourly: every public member-portal event the hub doesn't have yet is imported
 * as published. Events already in the hub are left alone, so an unpublish or
 * archive by an admin sticks (and events-refresh keeps them up to date).
 */
export const eventsPortalImportJob: Job = {
  name: 'events-portal-import',
  description: 'Imports public member-portal events the hub doesn\'t have yet as published. Existing events are left untouched.',
  cron: '15 * * * *',
  async run() {
    const known = new Set((await prisma.event.findMany({ select: { lumaEventId: true } })).map((e) => e.lumaEventId))
    const missing: string[] = []
    let cursor: string | undefined
    do {
      // the anonymous list only returns public events; `from` in the past = past events too
      const page = await listPortalEvents({ cursor, from: '2000-01-01T00:00:00Z' })
      for (const e of page.data) if (!known.has(e.id)) missing.push(e.id)
      cursor = page.nextCursor ?? undefined
    } while (cursor)

    const failed: { id: string; error: string }[] = []
    for (const id of missing) {
      try {
        const { event, created } = await upsertEvent(id, 'portal', null, true)
        if (created) await recordAudit({ actorId: null, action: 'event.import', entityType: 'Event', entityId: event.id, after: { lumaEventId: event.lumaEventId, name: event.name, source: 'portal', status: event.status } })
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) })
      }
      await new Promise((r) => setTimeout(r, 500)) // be gentle with the portal
    }
    return { imported: missing.length - failed.length, failed }
  },
}
