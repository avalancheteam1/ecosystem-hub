import 'server-only'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, CELL, esc, PARA } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { refreshPortalProfile } from '@/lib/member-portal'
import { allowedWhilePending, CODE_LOCK_MS, codeAttemptAllowed, endpointSucceeded, SECOND_FACTOR_PROOF_PATHS, secondFactorPending, SESSION_CODE_PATHS, type FactorState } from '@/lib/second-factor'

// Better Auth hooks for the second factor and email change (wired in src/lib/auth.ts).
// Rules live in src/lib/second-factor.ts.

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]
type SessionWithFactor = { session: { id: string; secondFactorAt?: Date | null }; user: { id: string; email: string } }

export async function factorState(userId: string): Promise<FactorState> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, _count: { select: { passkeys: true } } } })
  return { twoFactorEnabled: !!u?.twoFactorEnabled, passkeys: u?._count.passkeys ?? 0 }
}

const currentSession = (ctx: Ctx) => getSessionFromCtx(ctx, { disableRefresh: true }) as Promise<SessionWithFactor | null>

/** Runs before every Better Auth route. */
export async function secondFactorBefore(ctx: Ctx): Promise<void> {
  // Routes a pending session may call anyway (incl. /get-session on every page render) need no
  // lookup - except the code checks, which count attempts.
  if (allowedWhilePending(ctx.path) && !SESSION_CODE_PATHS.includes(ctx.path)) return
  const s = await currentSession(ctx)
  if (!s) return
  // Fail closed: a session that still owes its second factor may only prove it or sign out -
  // never disable 2FA, add/remove passkeys, change the email or link accounts.
  if (!allowedWhilePending(ctx.path) && secondFactorPending(await factorState(s.user.id), s.session.secondFactorAt ?? null)) {
    throw new APIError('FORBIDDEN', { message: 'Confirm it’s you with your passkey or authenticator app first.' })
  }
  // Better Auth limits wrong TOTP/backup codes only during password sign-in; on a session it doesn't.
  if (SESSION_CODE_PATHS.includes(ctx.path)) await reserveCodeAttempt(s.user.id)
}

const locked = () => new APIError('TOO_MANY_REQUESTS', { message: 'Too many wrong codes. Try again in 15 minutes.' })

/**
 * Count this attempt before the code is checked: a single UPDATE (row lock), so parallel
 * requests are serialised and each one counts. An expired lock starts a fresh count.
 * A correct code resets it (secondFactorAfter).
 */
async function reserveCodeAttempt(userId: string): Promise<void> {
  const now = new Date()
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    UPDATE two_factors SET
      "failedVerificationCount" = CASE WHEN "lockedUntil" <= ${now} THEN 1 ELSE COALESCE("failedVerificationCount", 0) + 1 END,
      "lockedUntil" = CASE WHEN "lockedUntil" <= ${now} THEN NULL ELSE "lockedUntil" END
    WHERE "userId" = ${userId} AND ("lockedUntil" IS NULL OR "lockedUntil" <= ${now})
    RETURNING "failedVerificationCount" AS n`
  if (rows.length === 0) {
    // No row = no authenticator app (the route fails on its own); a row that didn't match is locked.
    if (await prisma.twoFactor.count({ where: { userId } })) throw locked()
    return
  }
  if (!codeAttemptAllowed(rows[0]!.n)) {
    await prisma.twoFactor.updateMany({ where: { userId, lockedUntil: null }, data: { lockedUntil: new Date(now.getTime() + CODE_LOCK_MS) } })
    throw locked()
  }
}

/** Runs after every Better Auth route (success or failure). */
export async function secondFactorAfter(ctx: Ctx): Promise<void> {
  const path = ctx.path
  if (!SECOND_FACTOR_PROOF_PATHS.includes(path) && path !== '/two-factor/disable' && path !== '/passkey/delete-passkey' && path !== '/email-otp/change-email') return
  // Only act on a positive success: any error - incl. better-call's validation error, which is not
  // Better Auth's APIError subclass - must never prove a factor. A wrong code was already counted
  // in secondFactorBefore.
  if (!endpointSucceeded(ctx.context.returned)) return
  // Enabling/disabling TOTP replaces the session (newSession); otherwise it's the request's session.
  const fresh = ctx.context.newSession as SessionWithFactor | null
  const s = fresh ?? (await currentSession(ctx))
  if (!s) return
  const userId = s.user.id

  if (SESSION_CODE_PATHS.includes(path)) await prisma.twoFactor.updateMany({ where: { userId }, data: { failedVerificationCount: 0, lockedUntil: null } })

  // Removing a factor (e.g. after losing a device) signs out every other session: they may have
  // proven exactly that factor, and their secondFactorAt would otherwise keep them trusted.
  if (path === '/two-factor/disable' || path === '/passkey/delete-passkey') {
    await prisma.session.deleteMany({ where: { userId, id: { not: s.session.id } } })
  }

  if (SECOND_FACTOR_PROOF_PATHS.includes(path)) await prisma.session.update({ where: { id: s.session.id }, data: { secondFactorAt: new Date() } })

  // Audit: the state changes (a code check that only proves the factor isn't one).
  const audit = (action: string, extra: { entityType?: string; entityId?: string; before?: unknown; after?: unknown } = {}) =>
    recordAudit({ actorId: userId, action, entityType: extra.entityType ?? 'User', entityId: extra.entityId ?? userId, before: extra.before, after: extra.after })
  if (path === '/two-factor/verify-totp' && fresh) await audit('user.totp.enable') // first code confirms the app
  else if (path === '/two-factor/disable') await audit('user.totp.disable')
  else if (path === '/passkey/verify-registration') await audit('user.passkey.add', { entityType: 'Passkey', entityId: String((ctx.context.returned as { id?: string } | undefined)?.id ?? userId) })
  else if (path === '/passkey/delete-passkey') await audit('user.passkey.delete', { entityType: 'Passkey', entityId: String(ctx.body?.id ?? userId) })
  else if (path === '/email-otp/change-email') await afterEmailChange(userId, ctx.context.session?.user.email, String(ctx.body?.newEmail ?? '').toLowerCase())
}

/** Audit, tell the old address, refresh the member-portal copy (it's keyed by the email). */
async function afterEmailChange(userId: string, oldEmail: string | undefined, newEmail: string) {
  await recordAudit({ actorId: userId, action: 'user.email.change', entityType: 'User', entityId: userId, before: { email: oldEmail }, after: { email: newEmail } })
  if (oldEmail) {
    await sendMail({
      to: oldEmail,
      subject: 'Your team1 Ecosystem Hub email was changed',
      text: `The email of your team1 Ecosystem Hub account was changed to ${newEmail}.\n\nIf this wasn't you, reply to this email right away.`,
      html: brandedShell({
        preheader: 'The email of your team1 Ecosystem Hub account was changed',
        body: `<tr><td class="m-px" style="${CELL}">
          <p style="${PARA}">The email of your team1 Ecosystem Hub account was changed to <strong>${esc(newEmail)}</strong>.</p>
          <p style="${PARA}">If this wasn&rsquo;t you, reply to this email right away.</p>
        </td></tr>`,
      }),
    }).catch((err) => console.error('[auth] email-change notice failed', err))
  }
  await refreshPortalProfile(userId)
}
