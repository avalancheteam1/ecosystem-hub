import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/layout/logo'
import { reportRejectedNext } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { getAuthState } from '@/lib/session'
import { VerifyForm } from '../_components/verify-form'

export const metadata: Metadata = { title: 'Confirm it’s you', robots: { index: false } }

// Second step of a sign-in for accounts with a passkey or authenticator app (src/lib/second-factor.ts).
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const rawNext = (await searchParams).next
  await reportRejectedNext(rawNext)
  const next = safeNext(rawNext)
  const state = await getAuthState()
  if (state.status === 'signed-out') redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  if (state.status === 'signed-in') redirect(`/sign-in?next=${encodeURIComponent(next)}`) // finishes the sign-in (profile check)
  return (
    <main className="hero-glow min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-md">
        <Logo />
        <div className="mt-12 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
          <h1 className="text-2xl">Confirm it&apos;s you</h1>
          <p className="mt-1 text-sm text-fg-muted">Your account has an extra sign-in step.</p>
          <VerifyForm passkey={state.factors.passkeys > 0} totp={state.factors.twoFactorEnabled} />
        </div>
      </div>
    </main>
  )
}
