import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { buttonVariants } from '@/components/ui/button'
import { SectionCard } from '@/components/section-card'
import { readMyCommitteeInvitation } from '../../_lib/committee-queries'
import { AcceptCommitteeInvitation } from '../../_components/accept-committee-invitation'

export const metadata: Metadata = { title: 'Grants Committee invitation', robots: { index: false } }

export default async function JoinCommittee() {
  const invitation = await readMyCommitteeInvitation()
  const title = invitation.status === 'accepted' ? 'You’re on the Grants Committee' : 'Grants Committee invitation'
  return (
    <div className="container-page max-w-2xl py-10">
      <PageHeader title={title} />
      <SectionCard>
        {invitation.status === 'pending' ? (
          <>
            <p>Accept to join the Grants Committee and access submitted applications and evidence. Committee votes apply to shortlisted Mini Grants.</p>
            <AcceptCommitteeInvitation id={invitation.id} />
          </>
        ) : invitation.status === 'accepted' ? (
          <Link href="/admin/grants" className={buttonVariants({ className: 'min-h-11' })}>Open Grants review</Link>
        ) : (
          <p className="text-fg-muted">
            {invitation.status === 'expired' ? 'This invitation expired. Ask a Hub admin to resend it.'
              : invitation.status === 'access-removed' ? 'Ask a Hub admin to restore your Grants review access.'
                : 'No open invitation for this account. Sign in with the email address that received the invitation.'}
          </p>
        )}
      </SectionCard>
    </div>
  )
}
