import 'server-only'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins'
import { prisma } from '@/lib/db'
import { sendMail } from '@/lib/mailer'

// Sign-in methods: Google, GitHub, email OTP. Each social provider is enabled
// only when its credentials are set. Member-portal SSO will be added later via
// the genericOAuth plugin — one more entry, nothing else changes.
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

export const auth = betterAuth({
  appName: 'team1 Ecosystem Hub',
  // Profile edits go through our validated + audited server action
  // (dashboard/_lib/actions.ts), not Better Auth's generic endpoint.
  disabledPaths: ['/update-user'],
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
      // Managed only via /admin/access — never settable by the client.
      isSuperAdmin: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Email-OTP sign-ups arrive without a name; start with the email's local part.
        before: async (user) => ({ data: { ...user, name: user.name?.trim() || user.email.split('@')[0]! } }),
      },
    },
  },
  session: {
    // No cookie cache: every request checks the DB session, so revoking a
    // session (or deleting a user) takes effect immediately.
    cookieCache: { enabled: false },
  },
  // Better Auth's built-in rate limiter is on in production by default (in-memory,
  // per instance — move to `storage: 'database'` if the web service is scaled out).
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      async sendVerificationOTP({ email, otp }) {
        // Better Auth runs this as a background task and always answers success
        // (no account enumeration), so a mail failure is only visible in the
        // server log as "[Better Auth]: Failed to run background task".
        await sendMail({
          to: email,
          subject: `${otp} is your team1 hub sign-in code`,
          text: `Your team1 hub sign-in code is ${otp}.\n\nIt expires in 5 minutes. If you didn't request it, ignore this email.`,
        })
      },
    }),
    nextCookies(), // must stay last
  ],
})
