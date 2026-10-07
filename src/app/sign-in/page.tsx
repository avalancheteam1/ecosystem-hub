import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { enabledSocialProviders } from '@/lib/auth'
import { safeNext } from '@/lib/safe-next'
import { getCurrentUser } from '@/lib/session'
import { Logo } from '@/components/layout/logo'
import { SignInForm } from './_components/sign-in-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  if (await getCurrentUser()) redirect(next)
  return (
    <main className="hero-glow flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="animate-fade-in-up rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
          <h1 className="text-2xl">Sign in</h1>
          <p className="mt-1 text-sm text-fg-muted">New here? Signing in creates your builder account.</p>
          <SignInForm next={next} providers={enabledSocialProviders} />
        </div>
      </div>
    </main>
  )
}
