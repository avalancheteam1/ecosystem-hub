import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { ACADEMIES } from '@/app/(site)/education/_lib/content'
import { academyHref, allLessons, courseHref } from '@/app/(site)/education/_lib/rules'
import { TOOLING } from '@/app/(site)/tooling/_lib/content'
import { toolHref } from '@/app/(site)/tooling/_lib/rules'

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
    { url: `${siteUrl}/education`, changeFrequency: 'monthly', priority: 0.8 },
    ...ACADEMIES.flatMap((a) => [
      { url: `${siteUrl}${academyHref(a)}`, changeFrequency: 'monthly' as const, priority: 0.8 },
      ...a.courses.map((c) => ({ url: `${siteUrl}${courseHref(a, c)}`, changeFrequency: 'monthly' as const })),
      ...allLessons(a).map((l) => ({ url: `${siteUrl}${l.href}`, changeFrequency: 'yearly' as const })),
    ]),
    { url: `${siteUrl}/tooling`, changeFrequency: 'weekly', priority: 0.8 },
    ...TOOLING.tools.map((t) => ({ url: `${siteUrl}${toolHref(t)}`, changeFrequency: 'monthly' as const })),
  ]
}
