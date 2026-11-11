import pino from 'pino'
import { scrubDeep, scrubText, shortPrismaMessage } from '@/lib/sentry-scrub'

const SENSITIVE = ['authorization', 'cookie', 'set-cookie', 'email', 'otp', 'code', 'token', 'password', 'secret', 'key']

// Error text can hold user values (SMTP "550 <a@x.io> rejected", nodemailer `rejected: [...]`,
// Prisma validation errors print the query). Masks emails and invite tokens in every string of
// the serialized error, and shortens Prisma messages to their last line.
function serializeErr(err: unknown) {
  const out = pino.stdSerializers.err(err as Error)
  const name = `${out?.type ?? ''} ${(err as Error)?.name ?? ''}`
  if (/\bPrismaClient/.test(name) && out.message) {
    const short = shortPrismaMessage(out.message)
    out.stack = out.stack?.replace(out.message, short)
    out.message = short
  }
  return scrubDeep(out) as typeof out
}

export function createLogger(stream?: pino.DestinationStream): pino.Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      base: {
        service: process.env.NEXT_RUNTIME ? 'web' : 'worker',
        release: process.env.RAILWAY_GIT_COMMIT_SHA,
      },
      // no *.code: it would wipe err.code (Prisma P2002, ECONNREFUSED)
      serializers: { err: serializeErr },
      // The message (and its format arguments) is free text too: mask emails and invite tokens in it.
      hooks: {
        logMethod(args, method) {
          method.apply(this, args.map((a) => (typeof a === 'string' ? scrubText(a) : a)) as Parameters<typeof method>)
        },
      },
      redact: { paths: SENSITIVE.flatMap((k) => (k.includes('-') ? [`["${k}"]`, `*["${k}"]`] : k === 'code' ? [k] : [k, `*.${k}`, `*.*.${k}`])), censor: '[redacted]' },
    },
    stream,
  )
}

export const logger = createLogger()
