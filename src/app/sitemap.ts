import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db'
import { listEarnSitemapEntries } from '@/app/(site)/earn/_lib/queries'
import { ACADEMIES } from '@/app/(site)/education/_lib/content'
import { academyHref, allLessons, courseHref } from '@/app/(site)/education/_lib/rules'
import { listPublicToolSlugs } from '@/app/(site)/tooling/_lib/queries'
import { toolHref } from '@/app/(site)/tooling/_lib/rules'
import { isFlagOn } from '@/lib/flag-store'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

// Areas add their public pages here (e.g. every published hackathon).
// Dynamic: it reads the DB, which doesn't exist at Docker build time.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const toolsOn = await isFlagOn('tooling')
  const [events, bounties, tools] = await Promise.all([
    prisma.event.findMany({ where: { status: 'published' }, select: { slug: true, updatedAt: true } }),
    listEarnSitemapEntries(),
    toolsOn ? listPublicToolSlugs() : [],
  ])
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/events`, changeFrequency: 'daily', priority: 0.8 },
    ...events.map((e) => ({ url: `${siteUrl}/events/${e.slug}`, lastModified: e.updatedAt })),
    { url: `${siteUrl}/earn`, changeFrequency: 'daily', priority: 0.8 },
    ...bounties.map((bounty) => ({ url: `${siteUrl}/earn/${bounty.id}`, lastModified: bounty.resultsAnnouncedAt ?? bounty.publishedAt ?? undefined })),
    { url: `${siteUrl}/education`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/ecosystem`, changeFrequency: 'monthly', priority: 0.8 },
    ...ACADEMIES.flatMap((a) => [
      { url: `${siteUrl}${academyHref(a)}`, changeFrequency: 'monthly' as const, priority: 0.8 },
      ...a.courses.map((c) => ({ url: `${siteUrl}${courseHref(a, c)}`, changeFrequency: 'monthly' as const })),
      ...allLessons(a).map((l) => ({ url: `${siteUrl}${l.href}`, changeFrequency: 'yearly' as const })),
    ]),
    ...(toolsOn ? [{ url: `${siteUrl}/tooling`, changeFrequency: 'weekly' as const, priority: 0.8 }] : []),
    ...tools.map((t) => ({ url: `${siteUrl}${toolHref(t)}`, lastModified: t.approvedAt ?? undefined })),
  ]
}
