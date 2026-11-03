import type { z } from 'zod'
import { ActionError } from '@/lib/action-error'
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

export { ActionError }

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
    if (!user) return { ok: false, error: 'Not signed in' }
    if (opts.permission === 'superAdmin' ? !user.isSuperAdmin : opts.permission !== 'user' && !can(user, opts.permission)) {
      return { ok: false, error: user.superAdminNeedsSecondFactor ? 'Set up a passkey or authenticator app first (Profile → Security) to use super admin powers.' : 'Forbidden' }
    }
    const parsed = opts.schema.safeParse(input)
    if (!parsed.success) return { ok: false, error: issueMessage(parsed.error.issues[0]) }
    try {
      return { ok: true, data: await handler(parsed.data, user) }
    } catch (err) {
      if (err instanceof ActionError) return { ok: false, error: err.message }
      console.error('[action]', err)
      return { ok: false, error: 'Something went wrong' }
    }
  }
}
