import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins'
import { passkeyClient } from '@better-auth/passkey/client'

// twoFactorClient: no onTwoFactorRedirect - that's only for password sign-in, which the hub
// doesn't have. A session that owes its second factor is sent to /sign-in/verify by requireUser().
export const authClient = createAuthClient({ plugins: [emailOTPClient(), twoFactorClient(), passkeyClient()] })
