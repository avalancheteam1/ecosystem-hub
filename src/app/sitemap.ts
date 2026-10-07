import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

// Areas add their public pages here (e.g. every published hackathon).
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteUrl, changeFrequency: 'weekly', priority: 1 }]
}
