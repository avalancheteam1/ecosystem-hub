import { logger } from '@/lib/logger'
import type { z } from 'zod'
import { headers } from 'next/headers'
import { ActionError, ForbiddenError } from '@/lib/action-error'
import { captureError } from '@/lib/monitoring'
import { getRequestIp } from '@/lib/request-ip'
import { securityEvent } from '@/lib/security-events'
import { can, type Permission } from '@/lib/permissions'
import { getCurrentUser, type CurrentUser } from '@/lib/session'

// Server-action wrapper. Server actions are public POST endpoints - anyone can
// call them directly - so EVERY action re-checks auth here; a page-level guard
// is never enough.
//
//   export const createRole = action({ schema, permission: 'superAdmin' }, async (input, user) => { … })
//
// `permission`: a registry key, 'superAdmin', or 'user' (any signed-in user).

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export { ActionError, ForbiddenError }

/** Zod's built-in messages ("Too big: …") don't say which field - prefix the field name. Custom messages pass through. */
export function issueMessage(issue: z.core.$ZodIssue | undefined): string {
  if (!issue) return 'Invalid input'
  const key = issue.path.findLast((p) => typeof p === 'string')
  if (!key || !/^(Too big|Too small|Invalid)/.test(issue.message)) return issue.message
  const field = key.replace(/([A-Z])/g, ' $1').toLowerCase()
  return `${field[0]!.toUpperCase()}${field.slice(1)}: ${issue.message[0]!.toLowerCase()}${issue.message.slice(1)}`
}

export function action<S extends z.ZodType, T>(
  opts: { schema: S; permission: Permission | 'superAdmin' | 'user' },
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input) => {
    const user = await getCurrentUser()
    const ip = getRequestIp(await headers())
    if (!user) {
      securityEvent('action.unauthenticated', { ip })
      return { ok: false, error: 'Not signed in' }
    }
    if (opts.permission === 'superAdmin' ? !user.isSuperAdmin : opts.permission !== 'user' && !can(user, opts.permission)) {
      if (!user.superAdminNeedsSecondFactor) securityEvent('action.forbidden', { userId: user.id, ip, detail: { permission: opts.permission } })
      return { ok: false, error: user.superAdminNeedsSecondFactor ? 'Set up a passkey or authenticator app first (Profile → Sign-in & security) to use super admin powers.' : 'Forbidden' }
    }
    const parsed = opts.schema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      // Field path + zod code only, never the submitted value.
      securityEvent('action.invalid_input', { userId: user.id, ip, detail: { field: issue?.path.join('.').slice(0, 100), issue: issue?.code } })
      return { ok: false, error: issueMessage(issue) }
    }
    try {
      return { ok: true, data: await handler(parsed.data, user) }
    } catch (err) {
      if (err instanceof ForbiddenError) securityEvent('action.forbidden', { userId: user.id, ip, detail: { reason: err.message } })
      if (err instanceof ActionError) return { ok: false, error: err.message }
      logger.error({ err }, '[action]')
      // A short GlitchTip event id, so a user's report can be matched to the event.
      const ref = captureError(err, { userId: user.id })?.slice(0, 8)
      return { ok: false, error: ref ? `Something went wrong (ref: ${ref})` : 'Something went wrong' }
    }
  }
}
