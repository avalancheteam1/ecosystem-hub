import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'

/** Published events; "upcoming" = not ended yet (multi-day events stay until they end). */
export async function listPublicEvents(when: 'upcoming' | 'past', take: number, skip = 0) {
  const now = new Date()
  const upcoming = { OR: [{ endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }] }
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
