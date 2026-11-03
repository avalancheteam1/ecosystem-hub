// Second factor (passkey or authenticator app) - pure rules, isomorphic.
//
// Better Auth's twoFactor plugin only challenges password sign-ins, which the hub doesn't
// have. So the hub enforces it itself: a session records when it proved a second factor
// (`Session.secondFactorAt`). A user who set up a factor must prove it once per session;
// until then the session is "pending": getCurrentUser() treats it as signed out and
// src/lib/auth.ts refuses every Better Auth route except the ones below.

/** Better Auth routes a pending session may still call. Everything else is refused (fail closed). */
const PENDING_ALLOWED_PATHS = new Set([
  '/get-session',
  '/sign-out',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/passkey/generate-authenticate-options',
  '/passkey/verify-authentication',
])

export const allowedWhilePending = (path: string) => PENDING_ALLOWED_PATHS.has(path)

/** Routes that, when they succeed, prove a second factor for the current session. */
export const SECOND_FACTOR_PROOF_PATHS = ['/two-factor/verify-totp', '/two-factor/verify-backup-code', '/passkey/verify-registration']

/** Passkey sign-in: the new session is verified from the start. */
export const PASSKEY_SIGN_IN_PATH = '/passkey/verify-authentication'

/** TOTP / backup-code checks on a signed-in session, which Better Auth doesn't limit itself. */
export const SESSION_CODE_PATHS = ['/two-factor/verify-totp', '/two-factor/verify-backup-code']

export type FactorState = { twoFactorEnabled: boolean; passkeys: number }

export const hasSecondFactor = (u: FactorState) => u.twoFactorEnabled || u.passkeys > 0

/** Signed in, but the second factor isn't proven yet for this session. */
export const secondFactorPending = (u: FactorState, secondFactorAt: Date | null) => hasSecondFactor(u) && !secondFactorAt

/** Super admin powers need a factor that this session proved - otherwise the account works as a normal user. */
export const superAdminActive = (isSuperAdmin: boolean, u: FactorState, secondFactorAt: Date | null) =>
  isSuperAdmin && hasSecondFactor(u) && !!secondFactorAt

// Wrong codes on a signed-in session: lock the code check after MAX_FAILED in a row (NIST SP 800-63B §5.2.2).
// Stored on the TwoFactor row (failedVerificationCount, lockedUntil) - survives restarts. Every attempt is
// counted atomically BEFORE the code is checked (src/lib/auth-security.ts), so parallel guesses can't slip
// past the limit; a correct code resets the count.
export const MAX_FAILED_CODES = 10
export const CODE_LOCK_MS = 15 * 60_000

/** The n-th attempt in a row (counting this one) may still be checked. */
export const codeAttemptAllowed = (n: number) => n <= MAX_FAILED_CODES
