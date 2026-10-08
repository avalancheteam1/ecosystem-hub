import { prisma } from '@/lib/db'
import type { Job } from '@/lib/jobs'
import { refreshEventFromSource } from '../sync'

/** Daily: re-fetch every non-archived event that hasn't ended more than 30 days ago. */
export const eventsRefreshJob: Job = {
  name: 'events-refresh',
  cron: '0 4 * * *',
  async run() {
    const since = new Date(Date.now() - 30 * 86_400_000)
    const events = await prisma.event.findMany({
      where: { status: { not: 'archived' }, OR: [{ endAt: { gte: since } }, { endAt: null, startAt: { gte: since } }] },
      select: { id: true, name: true },
    })
    const failed: { id: string; name: string; error?: string }[] = []
    for (const e of events) {
      const res = await refreshEventFromSource(e.id)
      if (!res.ok) failed.push({ id: e.id, name: e.name, error: res.error })
      await new Promise((r) => setTimeout(r, 500)) // be gentle with Luma / the portal
    }
    return { checked: events.length, failed }
  },
}
