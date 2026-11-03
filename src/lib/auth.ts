import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { captcha, emailOTP } from 'better-auth/plugins'
import { prisma } from '@/lib/db'
import { brandedShell, CELL, esc, PARA } from '@/lib/email-template'
import { sendMail } from '@/lib/mailer'
import { bindInvitesForUser } from '@/app/(site)/events/_lib/hackathons/bind'
import { attributeReferral } from '@/app/(app)/referrals/_lib/attribute'
import { ensureReferralCode } from '@/lib/referral-codes'
import { refreshPortalProfile } from '@/lib/member-portal'
import { REF_COOKIE } from '@/app/(app)/referrals/_lib/rules'
import { rateLimit } from '@/lib/rate-limit'

// Sign-in methods: Google, GitHub, email OTP. Each social provider is enabled
// only when its credentials are set. Member-portal SSO will be added later via
// the genericOAuth plugin - one more entry, nothing else changes.
//
// Authorization is NOT handled by Better Auth (no admin/access plugin): see
// src/lib/permissions.ts and src/lib/session.ts.

const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
    : {}),
}

export const enabledSocialProviders = Object.keys(socialProviders) as ('google' | 'github')[]

// Cloudflare Turnstile on the "send code" step - enabled only when both keys are set.
export const turnstileSiteKey = process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY || undefined : undefined
const SEND_OTP_PATH = '/email-otp/send-verification-otp'

export const auth = betterAuth({
  appName: 'team1 Ecosystem Hub',
  // Profile edits go through our validated + audited server action
  // (profile/_lib/actions.ts), not Better Auth's generic endpoint.
  // No passwords: the email-OTP plugin's password-reset routes would mail codes
  // past the captcha + per-email cooldown (they only guard SEND_OTP_PATH).
  disabledPaths: ['/update-user', '/email-otp/request-password-reset', '/forget-password/email-otp', '/email-otp/reset-password'],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  socialProviders,
  account: {
    // Same email across Google / GitHub / OTP → one user, but only when the
    // provider reports the email as verified. No `trustedProviders` on purpose:
    // they link even unverified provider emails (account-takeover risk).
    accountLinking: { enabled: true },
  },
  user: {
    additionalFields: {
      // Managed only via /admin/access - never settable by the client.
      isSuperAdmin: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Email-OTP sign-ups arrive without a name; start with the email's local part.
        before: async (user) => ({ data: { ...user, name: user.name?.trim() || user.email.split('@')[0]! } }),
        // ?ref= cookie (set by src/proxy.ts) → credit the referrer. Never blocks sign-up.
        after: async (user, ctx) => {
          if (!ctx) return
          await attributeReferral(user.id, ctx.getCookie(REF_COOKIE)).catch((err) => console.error('[auth] referral attribution failed', err))
          await ensureReferralCode(user.id).catch((err) => console.error('[auth] default referral code failed', err))
          ctx.setCookie(REF_COOKIE, '', { maxAge: 0, path: '/' })
        },
      },
    },
    account: {
      create: {
        // Linking Google/GitHub to an existing user (e.g. an email-OTP sign-up)
        // doesn't touch the user's picture. Take the provider's picture only if
        // the user has none - never overwrite an uploaded avatar. Never blocks sign-in.
        after: async (account, ctx) => {
          const provider = ctx?.context.socialProviders.find((p) => p.id === account.providerId)
          if (!provider) return
          const user = await prisma.user.findUnique({ where: { id: account.userId }, select: { image: true } })
          if (!user || user.image) return
          const info = await provider
            .getUserInfo({ accessToken: account.accessToken ?? undefined, idToken: account.idToken ?? undefined })
            .catch((err) => void console.error('[auth] provider picture lookup failed', err))
          const image = info?.user.image
          if (image) await prisma.user.updateMany({ where: { id: account.userId, image: null }, data: { image } })
        },
      },
    },
    session: {
      create: {
        // Hackathon organiser/judge invites are by email; bind them on every
        // sign-in (invites for already-verified users bind at invite time), and
        // refresh the stored member-portal copy (tier + chapters).
        after: async (session) => {
          await bindInvitesForUser(session.userId).catch((err) => console.error('[auth] invite binding failed', err))
          // Never throws.
          await refreshPortalProfile(session.userId)
        },
      },
    },
  },
  hooks: {
    // One code per address per minute (any IP), so a botnet can't mail-bomb one inbox.
    // Same answer whether the account exists or not - no enumeration.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SEND_OTP_PATH || typeof ctx.body?.email !== 'string') return
      const email = ctx.body.email.trim().toLowerCase()
      const { ok, retryAfterSeconds } = rateLimit(`otp-email:${email}`, { limit: 1, windowMs: 60_000 })
      if (!ok) throw new APIError('TOO_MANY_REQUESTS', { message: `Please wait ${retryAfterSeconds}s before requesting another code.` })
      // Daily cap: 10 codes x 3 guesses = 30 guesses/day against a 6-digit code (~1:33,000).
      // ponytail: in-memory, resets on redeploy - fine at a few deploys/day; move to the DB if that changes.
      if (!rateLimit(`otp-email-day:${email}`, { limit: 10, windowMs: 86_400_000 }).ok)
        throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many codes requested for this address today. Try again tomorrow or sign in with Google/GitHub.' })
    }),
  },
  advanced: {
    // Production: visitor → Cloudflare → Railway. Cloudflare sets cf-connecting-ip (single
    // value, client can't forge it); a multi-hop x-forwarded-for is ignored by Better Auth,
    // which would leave its per-IP rate limiter without a key. Same rule as src/lib/request-ip.ts.
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
  },
  session: {
    // No cookie cache: every request checks the DB session, so revoking a
    // session (or deleting a user) takes effect immediately.
    cookieCache: { enabled: false },
  },
  // Better Auth's built-in rate limiter is on in production by default (in-memory,
  // per instance - move to `storage: 'database'` if the web service is scaled out).
  // The per-email cooldown above is our own limiter (src/lib/rate-limit.ts), same caveat.
  rateLimit: {
    // No per-IP limit on the sign-in flow: 500 people at one hackathon or university
    // share one IP and sign up within minutes. Abuse is stopped per browser/address
    // instead: Turnstile + the per-email cooldown for sending, and a code dies after
    // 3 wrong guesses (allowedAttempts), so guessing needs a new captcha'd code per 3 tries.
    customRules: {
      [SEND_OTP_PATH]: false,
      '/sign-in/email-otp': false,
      '/sign-in/social': false,
      '/callback/*': false,
    },
  },
  plugins: [
    // Runs before `hooks.before`, so a failed captcha never consumes an address's cooldown.
    ...(turnstileSiteKey
      ? [captcha({ provider: 'cloudflare-turnstile', secretKey: process.env.TURNSTILE_SECRET_KEY!, endpoints: [SEND_OTP_PATH] })]
      : []),
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      storeOTP: 'hashed', // a DB/backup reader can't use live codes
      async sendVerificationOTP({ email, otp }) {
        // Better Auth runs this as a background task and always answers success
        // (no account enumeration), so a mail failure is only visible in the
        // server log as "[Better Auth]: Failed to run background task".
        await sendMail({
          to: email,
          subject: `${otp} is your team1 Ecosystem Hub sign-in code`,
          text: `Your team1 Ecosystem Hub sign-in code is ${otp}.\n\nIt expires in 5 minutes. If you didn't request it, ignore this email.`,
          html: brandedShell({
            preheader: `Your team1 Ecosystem Hub sign-in code is ${otp}`,
            body: `<tr><td class="m-px" style="${CELL}">
              <p style="${PARA}">Your team1 Ecosystem Hub sign-in code:</p>
              <p style="margin:24px 0;text-align:center;font-size:32px;font-weight:600;letter-spacing:0.3em;color:#18181b;font-family:monospace">${esc(otp)}</p>
              <p style="${PARA}">It expires in 5 minutes. If you didn&rsquo;t request it, you can safely ignore this email.</p>
            </td></tr>`,
          }),
        })
      },
    }),
    nextCookies(), // must stay last
  ],
})
