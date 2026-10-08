import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { COUNTRIES } from '@/lib/countries'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { safeNext } from '@/lib/safe-next'
import { ProfileForm } from './_components/profile-form'

export const metadata: Metadata = { title: 'Your profile', robots: { index: false } }

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser()
  const nextParam = (await searchParams).next
  const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  return (
    <div className="max-w-3xl">
      <PageHeader title="Your profile" description={nextParam ? 'Add your country and at least one role to continue.' : 'How organisers, teammates and judges see you.'} />
      <ProfileForm
        userId={u.id}
        countries={COUNTRIES}
        next={nextParam ? safeNext(nextParam) : null}
        initial={{
          name: u.name, username: u.username, bio: u.bio, country: u.country, builderRoles: u.builderRoles as never, institution: u.institution, companyName: u.companyName, employeeRole: u.employeeRole,
          githubAccount: u.githubAccount, xAccount: u.xAccount, linkedinAccount: u.linkedinAccount, telegramAccount: u.telegramAccount, otherSocials: u.otherSocials, wallets: u.wallets, skills: u.skills,
          newsletterOptIn: u.newsletterOptIn, image: u.image,
        }}
      />
    </div>
  )
}
