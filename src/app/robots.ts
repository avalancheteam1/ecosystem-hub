import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/dashboard', '/api', '/sign-in'] },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
