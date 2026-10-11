import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { COURSES } from '@/app/(site)/education/_lib/content'
import { allLessons } from '@/app/(site)/education/_lib/rules'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

// Areas add their public pages here (e.g. every published hackathon).
// Dynamic: it reads the DB, which doesn't exist at Docker build time.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const events = await prisma.event.findMany({ where: { status: 'published' }, select: { slug: true, updatedAt: true } })
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: 'daily', priority: 0.8 },
    ...events.map((e) => ({ url: `${siteUrl}/events/${e.slug}`, lastModified: e.updatedAt })),
    { url: `${siteUrl}/education/entrepreneur`, changeFrequency: 'monthly', priority: 0.8 },
    ...COURSES.map((c) => ({ url: `${siteUrl}/education/entrepreneur/${c.slug}`, changeFrequency: 'monthly' as const })),
    ...allLessons(COURSES).map((l) => ({ url: `${siteUrl}${l.href}`, changeFrequency: 'yearly' as const })),
  ]
}
