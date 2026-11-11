import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs/config'

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

// GlitchTip (Sentry SDK). Without SENTRY_AUTH_TOKEN nothing is uploaded and no release is created:
// the build makes no Sentry network call. Blank values count as unset.
const env = (k: string) => process.env[k]?.trim() || undefined
const upload = Boolean(env('SENTRY_AUTH_TOKEN'))

export default withSentryConfig(nextConfig, {
  telemetry: false,
  silent: true,
  sentryUrl: env('SENTRY_URL'),
  org: env('SENTRY_ORG'),
  project: env('SENTRY_PROJECT'),
  authToken: env('SENTRY_AUTH_TOKEN'),
  release: { name: env('RAILWAY_GIT_COMMIT_SHA'), create: upload, finalize: upload },
  // Browser source maps are uploaded, then deleted, never served publicly.
  sourcemaps: upload ? { deleteSourcemapsAfterUpload: true } : { disable: true },
  // Same-origin route for browser events, outside /api/ so the proxy's tunnel cap applies.
  tunnelRoute: '/monitoring',
  // Errors only: no build-time tracing instrumentation (server errors arrive via onRequestError).
  buildTimeInstrumentation: false,
  suppressOnRouterTransitionStartWarning: true,
  // The route manifest (tracing names) would list every route, admin ones too, in the client bundle.
  routeManifestInjection: false,
})
