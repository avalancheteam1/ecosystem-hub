import type { Metadata } from 'next'
import { listJudgeHackathons } from '@/app/(site)/events/_lib/hackathons/queries'
import { LinkCard } from '@/components/link-card'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/guards'

export const metadata: Metadata = { title: 'Judging', robots: { index: false } }

export default async function JudgeIndex() {
  const user = await requireUser()
  const rows = await listJudgeHackathons(user.id)
  return (
    <>
      <PageHeader title="Judging" description="Hackathons you judge. You only see submissions assigned to you." />
      {rows.length === 0 ? (
        <p className="text-fg-muted">You aren&apos;t judging anything. Invites go to your email - sign in with that address.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((j) => {
            const open = j.assignments.filter((a) => !a.entry.stage.judgingClosedAt)
            const todo = open.filter((a) => !a.review?.submittedAt).length
            return (
              <li key={j.id}>
                <LinkCard href={`/judge/${j.hackathonId}`} image={j.hackathon.event.coverUrl} title={j.hackathon.event.name} meta={todo ? `${todo} to review` : open.length ? 'All done' : 'Nothing assigned yet'} metaClassName={todo ? 'text-brand' : undefined} />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
