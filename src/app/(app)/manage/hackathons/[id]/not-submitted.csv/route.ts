import { getManagedHackathon, listUnsubmittedProjects, listUnsubmittedRegistrations } from '@/app/(site)/events/_lib/hackathons/queries'
import { csv, notSubmittedExportRows } from '@/app/(site)/events/_lib/hackathons/csv'
import { getCurrentUser } from '@/lib/session'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  const h = await getManagedHackathon((await params).id, user)
  if (!h) return new Response('Not found', { status: 404 })
  const [drafts, registrations] = await Promise.all([listUnsubmittedProjects(h.id), listUnsubmittedRegistrations(h.id)])
  const rows = notSubmittedExportRows(drafts.map((d) => ({ name: d.project.currentVersion?.name ?? 'Untitled project', team: d.project.members.map((m) => m.user.name) })), registrations)
  const name = h.event.slug.replace(/[^a-z0-9-]/g, '')
  return new Response(csv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-not-submitted.csv"`, 'Cache-Control': 'no-store' },
  })
}
