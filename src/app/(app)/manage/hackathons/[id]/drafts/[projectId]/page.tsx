import { notFound } from 'next/navigation'
import { getManagedHackathon, getManagedDraft } from '@/app/(site)/events/_lib/hackathons/queries'
import { ProjectVersionView } from '@/components/project-version-view'
import { BackLink } from '@/components/back-link'
import { requireUser } from '@/lib/guards'

export const metadata = { title: 'Hackathon draft', robots: { index: false } }
export default async function DraftPage({ params }: { params: Promise<{ id: string; projectId: string }> }) {
  const { id, projectId } = await params
  const h = await getManagedHackathon(id, await requireUser())
  if (!h) notFound()
  const draft = await getManagedDraft(h.id, projectId)
  if (!draft?.project.currentVersion) notFound()
  return <div><BackLink href={`/manage/hackathons/${h.id}/submissions`}>Submissions</BackLink><div role="status" className="mb-6 rounded-xl border border-warning/40 p-5"><h1 className="text-2xl">Draft, not submitted</h1><p className="mt-2 text-fg-muted">This is a live draft, not a pinned submission. It can change. It cannot be judged until the team submits.</p><p className="mt-2 text-sm">Team: {draft.project.members.map((m) => m.user.name).join(', ')}</p></div><ProjectVersionView version={draft.project.currentVersion} /></div>
}
