import { logger } from '@/lib/logger'
import { z } from 'zod'

// Server env, checked at boot (src/instrumentation.ts logs a warning) and shown to super admins in /admin. Never blocks a start.
// ponytail: call sites still read process.env directly - this only validates; a typed getter can come when needed.

const blank = (v: unknown) => v === undefined || v === ''
const opt = <T extends z.ZodType>(s: T) => z.preprocess((v) => (blank(v) ? undefined : v), s.optional())
const int = z.coerce.number().int().positive()

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: opt(z.string().min(32, 'must be at least 32 characters')),
  LOG_HASH_SECRET: opt(z.string().min(16, 'must be at least 16 characters')),
  BETTER_AUTH_URL: opt(z.string().url()),
  NEXT_PUBLIC_SITE_URL: opt(z.string().url()),
  SMTP_HOST: opt(z.string()),
  SMTP_PORT: opt(int),
  SMTP_SECURE: opt(z.enum(['true', 'false'])),
  MAIL_FROM: opt(z.string()),
  STORAGE_PROVIDER: opt(z.enum(['s3', 'local'])),
  STORAGE_PUBLIC_BASE_URL: opt(z.string().url()),
  MEMBER_PORTAL_URL: opt(z.string().url()),
  SYSTEM_NOTIFICATION_URL: opt(z.string().url()),
  HEARTBEAT_URL: opt(z.string().url()),
  SENTRY_DSN: opt(z.string().url()),
  NEXT_PUBLIC_SENTRY_DSN: opt(z.string().url()),
  SENTRY_URL: opt(z.string().url()),
  SENTRY_ORG: opt(z.string()),
  SENTRY_PROJECT: opt(z.string()),
  SENTRY_AUTH_TOKEN: opt(z.string()),
  DB_POOL_MAX: opt(int),
  DB_POOL_IDLE_MS: opt(int),
  DB_POOL_CONNECT_MS: opt(int),
})

/** What's wrong with this env, one line per problem (empty = fine). Pure, for tests. */
export function envProblems(env: Record<string, string | undefined>): string[] {
  const parsed = schema.safeParse(env)
  const problems = parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  const missing = (keys: string[]) => keys.filter((k) => blank(env[k])).map((k) => `${k}: required`)
  // Providers are all-or-nothing, so a half-set pair doesn't silently disable sign-in.
  for (const [a, b] of [['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'], ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']]) {
    if (blank(env[a]) !== blank(env[b])) problems.push(`${blank(env[a]) ? a : b}: required when ${blank(env[a]) ? b : a} is set`)
  }
  const s3 = env.STORAGE_PROVIDER === 's3' || (blank(env.STORAGE_PROVIDER) && !blank(env.STORAGE_S3_BUCKET))
  if (s3) problems.push(...missing(['STORAGE_S3_ENDPOINT', 'STORAGE_S3_REGION', 'STORAGE_S3_ACCESS_KEY_ID', 'STORAGE_S3_SECRET_ACCESS_KEY', 'STORAGE_S3_BUCKET', 'STORAGE_PUBLIC_BASE_URL']))
  // Only what has no fallback in code (site URL, MAIL_FROM and the auth URL all do).
  if (env.NODE_ENV === 'production') problems.push(...missing(['BETTER_AUTH_SECRET', 'SMTP_HOST', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'LOG_HASH_SECRET']))
  return problems
}

export function warnServerEnv() {
  const problems = envProblems(process.env)
  if (problems.length) logger.warn({ problems }, 'Server environment problems')
}
