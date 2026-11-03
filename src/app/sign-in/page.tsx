import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Briefcase, Code2, GraduationCap, Sparkles } from 'lucide-react'
import { enabledSocialProviders, turnstileSiteKey } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasCompleteBasicProfile } from '@/lib/profile'
import { safeNext } from '@/lib/safe-next'
import { getAuthState } from '@/lib/session'
import { Logo } from '@/components/layout/logo'
import { SignInForm } from './_components/sign-in-form'

export const metadata: Metadata = { title: 'Join or sign in', robots: { index: false } }

// Who the hub is for - the first thing a newcomer reads, so everyone finds themselves in it.
const AUDIENCES = [
  { icon: Code2, title: 'Developers', body: 'Hackathons, bounties and workshops to ship on Avalanche.' },
  { icon: Briefcase, title: 'Founders & business', body: 'Meet builders, find partners and get your project ready for grants.' },
  { icon: GraduationCap, title: 'Students & universities', body: 'Courses, university programs and your first hackathon.' },
  { icon: Sparkles, title: 'Just curious', body: 'Meetups and events near you - no code needed.' },
]

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next)
  const state = await getAuthState()
  if (state.status === 'pending') redirect(`/sign-in/verify?next=${encodeURIComponent(next)}`)
  const user = state.status === 'signed-in' ? state.user : null
  // Both sign-in flows land back here: incomplete profiles (= new accounts) fill it in first,
  // then continue to `next` - the dashboard greets them when they didn't come for something specific.
  if (user) {
    const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true } })
    const after = next === '/dashboard' ? '/dashboard?welcome=1' : next
    redirect(hasCompleteBasicProfile(profile) ? next : `/profile?next=${encodeURIComponent(after)}`)
  }
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <main className="hero-glow min-h-dvh px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <Logo />
        <div className="mt-12 grid gap-10 lg:mt-20 lg:grid-cols-[1fr_24rem] lg:gap-x-16">
          <div className="animate-fade-in-up">
            <h1 className="max-w-[16ch] text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">
              Your home in the Avalanche ecosystem<span className="text-brand">.</span>
            </h1>
            <p className="mt-5 max-w-[46ch] text-lg text-fg-body">
              Join builders, founders and students from team1 chapters around the world. One free account for every event, hackathon and program.
            </p>
          </div>

          <div className="animate-fade-in-up rounded-xl border border-line bg-surface-2 p-6 [animation-delay:120ms] sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
            <h2 className="text-2xl">Join or sign in</h2>
            <p className="mt-1 text-sm text-fg-muted">New here? Same steps - we create your account on the way.</p>
            <SignInForm next={next} providers={enabledSocialProviders} turnstileSiteKey={turnstileSiteKey} nonce={nonce} />
            <p className="mt-6 text-xs text-fg-faint">
              We use your email to sign you in and for the programs you join.{' '}
              <a href="https://go.team1.network/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg-heading">Privacy policy</a>
            </p>
          </div>

          <ul className="grid gap-6 sm:grid-cols-2">
            {AUDIENCES.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="animate-fade-in-up flex gap-4" style={{ animationDelay: `${240 + i * 80}ms` }}>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-brand"><Icon className="size-5" aria-hidden /></span>
                <span>
                  <span className="block text-fg-heading">{title}</span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
