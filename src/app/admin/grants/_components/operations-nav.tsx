import Link from 'next/link'
import { isFlagOn } from '@/lib/flag-store'
import { getCurrentUser } from '@/lib/session'

export async function OperationsNav({ active }: { active: string }) {
  const [user, roundsOn, invitationsOn] = await Promise.all([
    getCurrentUser(), isFlagOn('grantsRoundManagement'), isFlagOn('grantsCommitteeInvitations'),
  ])
  const sections = [
    ['Applications', '/admin/grants'],
    ['Next actions', '/admin/grants/follow-ups'],
    ['Impact updates', '/admin/grants/impact'],
    ...(roundsOn ? [['Rounds', '/admin/grants/rounds']] : []),
    ...(invitationsOn && user?.isSuperAdmin ? [['Committee', '/admin/grants/committee']] : []),
  ]
  return (
    <nav aria-label="Grants administration" className="no-scrollbar mb-8 flex gap-1 overflow-x-auto border-b border-line">
      {sections.map(([name, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={active === name ? 'page' : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm ${active === name ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading'}`}
        >
          {name}
        </Link>
      ))}
    </nav>
  )
}
