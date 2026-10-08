import crypto from 'node:crypto'
import type { Metadata } from 'next'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { AcceptInvite } from '../../_components/accept-invite'

export const metadata: Metadata = { title: 'Team invite', robots: { index: false } }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser()
  const { token } = await params
  const invite = await prisma.projectInvite.findUnique({
    where: { tokenHash: crypto.createHash('sha256').update(token).digest('hex') },
    include: { project: { include: { currentVersion: { select: { name: true, shortDescription: true } } } }, invitedBy: { select: { name: true } } },
  })
  const usable = invite && !invite.revokedAt && !invite.acceptedAt && invite.expiresAt > new Date()
  return (
    <div className="mx-auto max-w-lg py-10 text-center">
      {usable ? (
        <>
          <p className="text-fg-muted">{invite.invitedBy?.name ?? 'Someone'} invited you to join</p>
          <h1 className="mt-2 text-3xl">{invite.project.currentVersion?.name}</h1>
          <p className="mt-2 text-fg-muted">{invite.project.currentVersion?.shortDescription}</p>
          {invite.email !== user.email.toLowerCase() && (
            <p className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">This invite is for {invite.email}. You&apos;re signed in as {user.email}.</p>
          )}
          <div className="mt-8"><AcceptInvite token={token} /></div>
        </>
      ) : (
        <>
          <h1 className="text-2xl">This invite can&apos;t be used</h1>
          <p className="mt-2 text-fg-muted">It may have expired, been revoked or already accepted. Ask the team to send a new one.</p>
        </>
      )}
    </div>
  )
}
