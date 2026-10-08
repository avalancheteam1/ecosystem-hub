import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { enabledSocialProviders } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasCompleteBasicProfile } from '@/lib/profile'
import { safeNext } from '@/lib/safe-next'
import { getCurrentUser } from '@/lib/session'
import { Logo } from '@/components/layout/logo'
import { SignInForm } from './_components/sign-in-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const user = await getCurrentUser()
  // Both sign-in flows land back here: incomplete profiles fill it in first, then continue to `next`.
  if (user) {
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true } })
    redirect(hasCompleteBasicProfile(profile) ? next : `/profile?next=${encodeURIComponent(next)}`)
  }
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
