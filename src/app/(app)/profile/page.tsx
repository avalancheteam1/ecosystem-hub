import type { User } from '@prisma/client'
import type { Metadata } from 'next'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { COUNTRIES } from '@/lib/countries'
import { formatShortDate } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { TIER_LABELS } from '@/lib/groups'
import { requireUser } from '@/lib/guards'
import { BUILDER_HUB_URL } from '@/lib/builder-hub'
import { getPortalProfile } from '@/lib/member-portal'
import { hasCompleteBasicProfile, type ProfileFormValues } from '@/lib/profile'
import { safeNext } from '@/lib/safe-next'
import { getUserGroups } from '@/lib/user-groups'
import { ProfileForm } from './_components/profile-form'

export const metadata: Metadata = { title: 'Your profile', robots: { index: false } }

function formValues(u: User): ProfileFormValues {
  return {
    name: u.name, bio: u.bio, country: u.country, builderRoles: u.builderRoles as never, institution: u.institution, companyName: u.companyName, employeeRole: u.employeeRole as never,
    githubAccount: u.githubAccount, xAccount: u.xAccount, linkedinAccount: u.linkedinAccount, telegramAccount: u.telegramAccount, otherSocials: u.otherSocials, wallets: u.wallets, skills: u.skills,
    newsletterOptIn: u.newsletterOptIn, image: u.image,
  }
}

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  const [u, profile, { groups }] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: user.id } }), getPortalProfile(user.id), getUserGroups(user.id)])
  const leadGroups = groups.filter((g) => g.lead)
  const next = nextParam ? safeNext(nextParam) : null
  // First visit (fresh account, or sent here to finish it): a short welcome step - only what's
  // required plus the basics; socials, wallets and skills wait for a later visit.
  if (next && !hasCompleteBasicProfile(u)) {
    // Email sign-ups start with the email's local part as name (auth.ts) - don't greet with that, ask instead.
    const placeholder = u.name === u.email.split('@')[0]
    const first = placeholder ? '' : u.name.trim().split(/\s+/)[0]
    return (
      <div className="mx-auto max-w-3xl">
        <div className="animate-fade-in-up mb-10">
          <p className="meta">One quick step · about a minute</p>
          <h1 className="mt-3 text-4xl leading-[1.05] tracking-[-0.02em] sm:text-5xl">Welcome to team1{first ? `, ${first}` : ''}<span className="text-brand">.</span></h1>
          <p className="mt-4 max-w-[52ch] text-lg text-fg-body">Tell us who you are and where you&apos;re based - so we can point you to the right events, programs and people. You can add socials and wallets anytime later.</p>
        </div>
        <ProfileForm userId={u.id} countries={COUNTRIES} next={next} onboarding initial={{ ...formValues(u), name: placeholder ? '' : u.name }} />
      </div>
    )
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Your profile" description={nextParam ? 'Add your name, country and at least one role to continue.' : 'How organisers, teammates and judges see you.'} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
        <ProfileForm
          userId={u.id}
          countries={COUNTRIES}
          next={next}
          initial={formValues(u)}
        />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Membership and links">
          {profile?.tier && (
            <div className="rounded-xl border border-line bg-surface-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm text-fg-heading">team1 membership</h2>
                <StatusPill tone="info">{TIER_LABELS[profile.tier]}</StatusPill>
              </div>
              {profile.chapters.length > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-fg-body">
                  {profile.chapters.map((c) => (
                    <li key={c.slug} className="flex flex-wrap items-center gap-2">
                      <span>{c.name}</span>
                      {c.primary && <StatusPill>primary</StatusPill>}
                      {c.lead && <StatusPill tone="info">lead</StatusPill>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-fg-faint">From the member portal · updated {formatShortDate(profile.fetchedAt, 'UTC')}</p>
            </div>
          )}
          <div className="rounded-xl border border-line bg-surface-2 px-5 py-2">
            <ul className="divide-y divide-line text-sm">
              <li><Link href="/projects" className="flex min-h-11 items-center text-fg-body hover:text-fg-heading">Your projects</Link></li>
              <li><Link href="/referrals" className="flex min-h-11 items-center text-fg-body hover:text-fg-heading">Your referral links</Link></li>
              <li>
                <a href={BUILDER_HUB_URL} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-between gap-2 text-fg-body hover:text-fg-heading">
                  Avalanche Builder Hub <ExternalLink className="size-4" aria-hidden />
                </a>
              </li>
              {leadGroups.map((g) => (
                <li key={g.group.id}><Link href={`/groups/${g.group.slug}`} className="flex min-h-11 items-center text-fg-body hover:text-fg-heading">Group stats · {g.group.name}</Link></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
