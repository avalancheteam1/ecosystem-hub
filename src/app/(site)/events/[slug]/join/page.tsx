import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { hasCompleteBasicProfile } from '@/lib/profile'
import { getPublicHackathon } from '../../_lib/hackathons/queries'
import { getPublicEvent } from '../../_lib/queries'
import { JoinForm } from './join-form'

export const metadata: Metadata = { title: 'Register', robots: { index: false } }

export default async function JoinPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params
  const { invite } = await searchParams
  const user = await requireUser()
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const h = await getPublicHackathon(event.id, user.id)
  if (!h) notFound()
  // Only to pick the copy — joinHackathon re-checks the invite.
  const invited = typeof invite === 'string' && (await prisma.hackathon.count({ where: { id: h.id, inviteToken: invite } })) > 0
  if (h.joined || h.registration === 'pending' || (h.registration === 'rejected' && !invited)) redirect(`/events/${slug}`)
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, country: true, builderRoles: true } })
  if (!hasCompleteBasicProfile(profile)) {
    return (
      <div className="container-page max-w-xl py-20 text-center">
        <h1 className="text-3xl">One step before you register</h1>
        <p className="mt-3 text-fg-muted">Add your country and what roles describe you, so organisers know who&apos;s building.</p>
        <Button asChild size="lg" className="mt-8"><Link href={`/profile?next=${encodeURIComponent(`/events/${slug}/join${invited ? `?invite=${invite}` : ''}`)}`}>Complete your profile</Link></Button>
      </div>
    )
  }
  return (
    <div className="container-page max-w-2xl py-14">
      <p className="text-fg-muted">{event.name}</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">Register for Hackathon</h1>
      <p className="mt-3 text-fg-muted">
        You register as {user.name} ({user.email}). Teams form around projects — you can create or join one after this.
        {h.requireApproval && !invited && ' The organisers review every registration — we’ll email you once you’re in.'}
      </p>
      <div className="mt-10 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <JoinForm hackathonId={h.id} fields={h.fields} termsUrl={h.termsUrl} invite={invited ? invite : undefined} needsApproval={h.requireApproval && !invited} />
      </div>
    </div>
  )
}
