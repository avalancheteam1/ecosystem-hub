import 'server-only'
import { createHmac } from 'node:crypto'
import { logger } from '@/lib/logger'
import { captureSecurity } from '@/lib/monitoring'
import { createSecurityGate, type SecurityEventType } from '@/lib/security-rules'
import { sendSystemAlert } from '@/lib/system-alert'

const gate = createSecurityGate()

/**
 * HMAC-SHA256 hex of the trimmed, lowercased value - the only form of an email/IP that may be logged.
 * Key: LOG_HASH_SECRET, else one derived from BETTER_AUTH_SECRET. Undefined in production without a key: a hash under a known constant could be reversed.
 */
export function hashIdentifier(value: string): string | undefined {
  // || on purpose: a blank var is unset. The fallback is a key derived from the auth secret, never the auth secret itself.
  const auth = process.env.BETTER_AUTH_SECRET
  const key = process.env.LOG_HASH_SECRET || (auth ? createHmac('sha256', auth).update('log-hash').digest() : process.env.NODE_ENV === 'production' ? undefined : 'dev-only')
  if (!key) return undefined
  return createHmac('sha256', key).update(value.trim().toLowerCase()).digest('hex')
}

type Ctx = { userId?: string; email?: string; ip?: string | null; target?: string; detail?: Record<string, unknown> }

/** Records a security-relevant event: structured log, GlitchTip capture, operator alert. Never throws, never awaits. No per-IP counting. */
export function securityEvent(type: SecurityEventType, ctx: Ctx = {}): void {
  try {
    const emailHash = ctx.email ? hashIdentifier(ctx.email) : undefined
    const ipHash = ctx.ip ? hashIdentifier(ctx.ip) : undefined
    const target = ctx.target ?? ctx.userId ?? emailHash
    const { capture, alert } = gate.evaluate(type, target, Date.now())
    logger.warn({ ...ctx.detail, event: type, userId: ctx.userId, emailHash, ipHash }, 'security event')
    const tags = { event: type }
    // Each sink is guarded on its own: a failing capture must never lose the alert (the gate already spent its dedupe slot).
    const safe = (fn: () => void) => {
      try {
        fn()
      } catch (err) {
        logger.error({ err }, 'security capture failed')
      }
    }
    if (alert) safe(() => void sendSystemAlert(alert).catch((err) => logger.error({ err }, 'security alert failed')))
    if (capture) safe(() => captureSecurity(type, 'warning', { userId: ctx.userId, tags, extra: ctx.detail }))
    if (alert) safe(() => captureSecurity('security.alert', 'error', { userId: ctx.userId, tags, extra: { title: alert.title } }))
  } catch (err) {
    try {
      logger.error({ err }, 'securityEvent failed')
    } catch {}
  }
}
