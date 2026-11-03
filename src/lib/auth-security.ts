import 'server-only'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { brandedShell, CELL, esc, PARA } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { refreshPortalProfile } from '@/lib/member-portal'
import { afterFailedCode, allowedWhilePending, isCodeLocked, SECOND_FACTOR_PROOF_PATHS, secondFactorPending, SESSION_CODE_PATHS, type FactorState } from '@/lib/second-factor'

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
  const s = await currentSession(ctx)
  if (!s) return
  // Fail closed: a session that still owes its second factor may only prove it or sign out -
  // never disable 2FA, add/remove passkeys, change the email or link accounts.
  if (!allowedWhilePending(ctx.path) && secondFactorPending(await factorState(s.user.id), s.session.secondFactorAt ?? null)) {
    throw new APIError('FORBIDDEN', { message: 'Confirm it’s you with your passkey or authenticator app first.' })
  }
  // Better Auth limits wrong TOTP/backup codes only during password sign-in; on a session it doesn't.
  if (SESSION_CODE_PATHS.includes(ctx.path)) {
    const tf = await prisma.twoFactor.findFirst({ where: { userId: s.user.id }, select: { lockedUntil: true } })
    if (isCodeLocked(tf?.lockedUntil ?? null, new Date())) throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many wrong codes. Try again in 15 minutes.' })
  }
}

/** Runs after every Better Auth route (success or failure). */
export async function secondFactorAfter(ctx: Ctx): Promise<void> {
  const failed = ctx.context.returned instanceof APIError
  const path = ctx.path
  if (!SECOND_FACTOR_PROOF_PATHS.includes(path) && path !== '/two-factor/disable' && path !== '/passkey/delete-passkey' && path !== '/email-otp/change-email') return
  // Enabling/disabling TOTP replaces the session (newSession); otherwise it's the request's session.
  const fresh = ctx.context.newSession as SessionWithFactor | null
  const s = fresh ?? (await currentSession(ctx))
  if (!s) return
  const userId = s.user.id

  if (SESSION_CODE_PATHS.includes(path)) {
    const tf = await prisma.twoFactor.findFirst({ where: { userId }, select: { id: true, failedVerificationCount: true, lockedUntil: true } })
    if (tf) {
      await prisma.twoFactor.update({
        where: { id: tf.id },
        data: failed ? afterFailedCode(tf.failedVerificationCount ?? 0, tf.lockedUntil, new Date()) : { failedVerificationCount: 0, lockedUntil: null },
      })
    }
  }
  if (failed) return

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
