import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getManagedHackathon, listSubmissions } from '@/app/(site)/events/_lib/hackathons/queries'
import { StatusPill } from '@/components/status-pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireUser } from '@/lib/guards'
import { SubmissionStatusButton } from '../_components/submission-controls'

export const metadata = { title: 'Submissions' }

export default async function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const subs = await listSubmissions(h.id)
  const trackName = (id: string) => h.tracks.find((t) => t.id === id)?.name
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Team</TableHead>
            {h.stages.map((s) => <TableHead key={s.id}>{s.name}</TableHead>)}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subs.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link href={`/manage/hackathons/${h.id}/submissions/${s.id}`} className="text-fg-heading hover:underline">{s.project.currentVersion?.name}</Link>
                <div className="text-xs text-fg-muted">{s.trackIds.map(trackName).filter(Boolean).join(', ')}</div>
              </TableCell>
              <TableCell className="text-sm">{s.project.members.map((m) => m.user.name).join(', ')}</TableCell>
              {h.stages.map((st) => {
                const e = s.entries.find((x) => x.stageId === st.id)
                return (
                  <TableCell key={st.id} className="text-sm whitespace-nowrap">
                    {e ? <>v{e.projectVersion.number}{e.advancedAt && <StatusPill tone="success" className="ml-2">Advanced</StatusPill>}</> : <span className="text-fg-faint">—</span>}
                  </TableCell>
                )
              })}
              <TableCell>
                <StatusPill tone={s.status === 'active' ? 'success' : s.status === 'disqualified' ? 'danger' : 'neutral'}>{s.status}</StatusPill>
              </TableCell>
              <TableCell className="text-right"><SubmissionStatusButton hackathonId={h.id} submissionId={s.id} status={s.status} /></TableCell>
            </TableRow>
          ))}
          {subs.length === 0 && <TableRow><TableCell colSpan={4 + h.stages.length} className="py-12 text-center text-fg-muted">No submissions yet.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  )
}
