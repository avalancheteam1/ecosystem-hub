import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { ShieldAlert } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { turnstileSiteKey } from '@/lib/auth'
import { formatShortDate } from '@/lib/dates'
import { requireUser } from '@/lib/guards'
import { getSecuritySettings } from '../_lib/queries'
import { EmailChange } from '../_components/security/email-change'
import { PasskeysCard } from '../_components/security/passkeys-card'
import { TotpCard } from '../_components/security/totp-card'

export const metadata: Metadata = { title: 'Sign-in & security', robots: { index: false } }

export default async function SecurityPage() {
  const user = await requireUser()
  const [settings, nonce] = await Promise.all([getSecuritySettings(user.id), headers().then((h) => h.get('x-nonce') ?? undefined)])
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href="/profile">Your profile</BackLink>
      <PageHeader title="Sign-in & security" description="Your email and the extra step that protects your account." />
      {user.superAdminNeedsSecondFactor && (
        <div role="status" className="mb-6 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden />
          <p className="text-fg-body">
            <span className="text-fg-heading">Super admin powers are off until you add a passkey or an authenticator app.</span> After that, every sign-in asks for it once.
          </p>
        </div>
      )}
      <div className="space-y-6">
        <SectionCard title="Email address" description="Where your sign-in codes go.">
          <EmailChange email={user.email} turnstileSiteKey={turnstileSiteKey} nonce={nonce} />
        </SectionCard>
        <SectionCard
          title="Passkeys"
          description="Sign in with your fingerprint, face or device PIN - no code needed. Once you have one, signing in with an email code or Google/GitHub also asks for it (or the authenticator app)."
        >
          <PasskeysCard passkeys={settings.passkeys.map((p) => ({ id: p.id, label: p.label, added: p.createdAt ? formatShortDate(p.createdAt, 'UTC') : '-' }))} />
        </SectionCard>
        <SectionCard title="Authenticator app" description="A 6-digit code from an app on your phone, asked once per sign-in. Comes with backup codes in case you lose the phone.">
          <TotpCard enabled={settings.totp} />
        </SectionCard>
      </div>
    </div>
  )
}
