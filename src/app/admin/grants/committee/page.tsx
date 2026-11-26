import type { Metadata } from 'next'
import { Mail, Plus } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { readCommitteeSettings } from '@/app/(site)/grants/_lib/committee-queries'
import { committeeApprovalDescription, committeeApprovalLabel } from '@/app/(site)/grants/_lib/committee-policy'
import { CommitteeInviteButton, CommitteeMemberControls, CommitteePendingControls, CommitteeSettingsButton } from '../_components/committee-invite-controls'
import { OperationsNav } from '../_components/operations-nav'

export const metadata: Metadata = { title: 'Grants Committee' }

export default async function CommitteeSettings() {
  const { seats, shortlister, mailEnabled, reviewEnabled, settings } = await readCommitteeSettings()
  const { seatCount, approvalRule } = settings
  const active = seats.filter((seat) => seat.active).length
  const pending = seats.filter((seat) => !seat.userId).length
  const unavailable = seats.length - active - pending
  const open = Math.max(0, seatCount - seats.length)
  const summary = [
    `${active} active`, `${pending} pending`,
    ...(unavailable ? [`${unavailable} unavailable`] : []),
    `${open} open`,
  ].join(' · ')
  const now = new Date()
  return (
    <>
      <OperationsNav active="Committee" />
      <PageHeader title="Grants Committee" description="Manage who reviews shortlisted Mini Grants applications.">
        <CommitteeInviteButton disabled={!mailEnabled || seats.length >= seatCount} />
      </PageHeader>
      {!mailEnabled && <p className="mb-6 text-sm text-fg-muted">Turn on the Grants feature flag to send invitations.</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <SectionCard title="Members" description={summary}>
          <ul className="-mx-6 -mb-6 divide-y divide-line border-t border-line" aria-label="Committee seats">
            {[...seats, ...Array.from({ length: open }, () => null)].map((seat, index) => {
              const name = seat?.user?.name
              const expired = !!seat && !seat.userId && seat.expiresAt <= now
              return (
                <li key={seat?.id ?? `open-${index}`} className="grid min-h-16 grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 px-4 py-2 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:px-6">
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg border border-line bg-surface-1 text-sm font-medium text-fg-muted">
                    {name ? name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('')
                      : seat ? <Mail className="size-4" /> : <Plus className="size-4" />}
                  </span>
                  <div className="min-w-0 break-words">
                    <p className="font-medium text-fg-heading">{name || seat?.email || 'Open seat'}</p>
                    {name && seat && <p className="text-sm text-fg-muted">{seat.email}</p>}
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-1 sm:col-start-3 sm:justify-end">
                    <StatusPill tone={seat?.active ? 'success' : seat ? 'warning' : 'neutral'}>
                      {seat?.active ? 'Active' : seat?.userId ? 'Access unavailable' : expired ? 'Invite expired' : seat ? 'Invite pending' : 'Open'}
                    </StatusPill>
                    {seat?.userId ? <CommitteeMemberControls id={seat.id} />
                      : seat && <CommitteePendingControls id={seat.id} mailEnabled={mailEnabled} />}
                  </div>
                </li>
              )
            })}
          </ul>
        </SectionCard>
        <SectionCard title="Approval rule" actions={<CommitteeSettingsButton {...settings} occupied={seats.length} />}>
          <div className="mb-3 grid auto-cols-fr grid-flow-col gap-1" aria-hidden="true">
            {Array.from({ length: seatCount }, (_, index) => <div key={index} className={`h-1.5 rounded-full ${index < active ? 'bg-success' : 'bg-surface-hover'}`} />)}
          </div>
          <p className="text-fg-heading">{active} of {seatCount} reviewers active</p>
          <p className="mt-2 text-sm text-fg-muted">Fill all configured seats before shortlisting.</p>
          <p className="mt-4 font-medium text-fg-heading">{committeeApprovalLabel[approvalRule]}</p>
          <p className="mt-1 text-sm text-fg-muted">{committeeApprovalDescription[approvalRule]}</p>
          {!reviewEnabled && <p className="mt-2 text-sm text-fg-muted">Committee review is off in feature flags.</p>}
          <div className="mt-4 border-t border-line pt-4">
            <p className="font-medium text-fg-heading">{shortlister ? `${shortlister.name} · Shortlister` : 'Shortlister to be configured'}</p>
            <p className="mt-1 text-sm text-fg-muted">The shortlister selects applications for review. The Committee votes on awards.</p>
          </div>
        </SectionCard>
      </div>
    </>
  )
}
