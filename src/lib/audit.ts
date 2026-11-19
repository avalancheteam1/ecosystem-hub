import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { getRequestIp } from '@/lib/request-ip'

// Audit trail. Call recordAudit for EVERY state-changing admin action.
// When both before/after are plain objects only the changed keys are stored.
// Never pass secrets (API keys, hashes, tokens) in before/after.

type AuditArgs = {
  actorId: string | null
  /** dotted verb, e.g. "role.create", "user.permissions.set", "job.run" */
  action: string
  entityType: string
  entityId?: string | null
  before?: unknown
  after?: unknown
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

export function diffObjects(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k] ?? null
      a[k] = after[k] ?? null
    }
  }
  return { before: b, after: a }
}

async function requestIp(): Promise<string | null> {
  try {
    return getRequestIp(await headers())
  } catch {
    return null // outside a request (worker, scripts)
  }
}

const json = (v: unknown) => (v === undefined ? undefined : (v as Prisma.InputJsonValue))

/** Pass a transaction when the change must roll back if its audit entry cannot be written. */
export async function recordAudit(args: AuditArgs, tx?: Prisma.TransactionClient): Promise<void> {
  let { before, after } = args
  if (isPlainObject(before) && isPlainObject(after)) ({ before, after } = diffObjects(before, after))
  const write = async () => {
    await (tx ?? prisma).auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId ?? null,
        before: json(before),
        after: json(after),
        ip: await requestIp(),
      },
    })
  }
  if (tx) return write()
  try {
    await write()
  } catch (err) {
    logger.error({ err }, '[audit] failed to write entry')
  }
}
