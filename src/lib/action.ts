import type { z } from 'zod'
import { ActionError } from '@/lib/action-error'
import { can, type Permission } from '@/lib/permissions'
import { getCurrentUser, type CurrentUser } from '@/lib/session'

// Server-action wrapper. Server actions are public POST endpoints — anyone can
// call them directly — so EVERY action re-checks auth here; a page-level guard
// is never enough.
//
//   export const createRole = action({ schema, permission: 'superAdmin' }, async (input, user) => { … })
//
// `permission`: a registry key, 'superAdmin', or 'user' (any signed-in user).

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export { ActionError }

export function action<S extends z.ZodType, T>(
  opts: { schema: S; permission: Permission | 'superAdmin' | 'user' },
  handler: (input: z.infer<S>, user: CurrentUser) => Promise<T>,
): (input: z.input<S>) => Promise<ActionResult<T>> {
  return async (input) => {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: 'Not signed in' }
    if (opts.permission === 'superAdmin' ? !user.isSuperAdmin : opts.permission !== 'user' && !can(user, opts.permission)) {
      return { ok: false, error: 'Forbidden' }
    }
    const parsed = opts.schema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    try {
      return { ok: true, data: await handler(parsed.data, user) }
    } catch (err) {
      if (err instanceof ActionError) return { ok: false, error: err.message }
      console.error('[action]', err)
      return { ok: false, error: 'Something went wrong' }
    }
  }
}
