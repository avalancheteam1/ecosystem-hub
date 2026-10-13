import type { NextConfig } from 'next'

// Content-Security-Policy is set per request in src/proxy.ts (it carries a nonce).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
]

// next/image host for uploads, derived from STORAGE_PUBLIC_BASE_URL (one place to configure).
function uploadsRemotePattern() {
  const base = process.env.STORAGE_PUBLIC_BASE_URL
  if (!base) return []
  try {
    const { protocol, hostname } = new URL(base)
    return [{ protocol: protocol.replace(/:$/, '') as 'http' | 'https', hostname }]
  } catch {
    return []
  }
}

const nextConfig: NextConfig = {
  // Standalone build: minimal Node server for the Railway Docker image.
  output: 'standalone',
  poweredByHeader: false,
  // Image uploads go through a server action (FormData); covers are up to 2 MB.
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  serverExternalPackages: ['@prisma/client', 'pg-boss'],
  // Lesson Markdown is read from disk at request time (src/app/(site)/education/_lib/content.ts).
  outputFileTracingIncludes: { '/education/**': ['src/app/(site)/education/_content/**/*.md'] },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'images.lumacdn.com' },
      ...uploadsRemotePattern(),
    ],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
