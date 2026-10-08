import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

/** "Upcoming" = not ended yet (multi-day events stay until they end). */
export function upcomingEventWhere(now = new Date()) {
  return { OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] }
}

/** Published events, upcoming or past. */
export async function listPublicEvents(when: 'upcoming' | 'past', take: number, skip = 0) {
  const upcoming = upcomingEventWhere()
  return prisma.event.findMany({
    where: { status: 'published', ...(when === 'upcoming' ? upcoming : { NOT: upcoming }) },
    orderBy: { startAt: when === 'upcoming' ? 'asc' : 'desc' },
    skip,
    take,
    include: { hackathon: { select: { status: true } } },
  })
}

export const getPublicEvent = cache(async (slug: string) => {
  const event = await prisma.event.findUnique({ where: { slug } })
  return event?.status === 'published' ? event : null
})
