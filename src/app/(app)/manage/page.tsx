import type { Metadata } from 'next'
import { listManagedHackathons } from '@/app/(site)/events/_lib/hackathons/queries'
import { LinkCard } from '@/components/link-card'
import { PageHeader } from '@/components/layout/page-header'
import { formatShortDate } from '@/lib/dates'
import { requireUser } from '@/lib/guards'
import { can } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Hackathons you run', robots: { index: false } }

export default async function ManageIndex() {
  const user = await requireUser()
  const all = can(user, 'hackathons.manage')
  const hackathons = await listManagedHackathons(user, all)
  return (
    <>
      <PageHeader title="Hackathons you run" description={all ? 'You can manage every hackathon.' : 'Hackathons where you are an organiser.'} />
      {hackathons.length === 0 ? (
        <p className="text-fg-muted">Nothing here yet. {all ? 'Turn an event into a hackathon from Admin → Events.' : 'Ask an Ecosystem Hub admin to add you as an organiser.'}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {hackathons.map((h) => (
            <li key={h.id}>
              <LinkCard href={`/manage/hackathons/${h.id}`} image={h.event.coverUrl} title={h.event.name} meta={`${formatShortDate(h.event.startAt, h.event.timezone)} — ${h.status === 'published' ? 'Live' : 'Draft'}`} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
