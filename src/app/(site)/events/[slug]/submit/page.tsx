import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listMyProjects } from '@/app/(app)/projects/_lib/queries'
import { missingForSubmission } from '@/app/(app)/projects/_lib/rules'
import { Markdown } from '@/components/markdown'
import { formatEventRange } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { getMySubmission, getPublicHackathon } from '../../_lib/hackathons/queries'
import { stageState } from '../../_lib/hackathons/rules'
import { getPublicEvent } from '../../_lib/queries'
import { SubmitForm } from './submit-form'

export const metadata: Metadata = { title: 'Submit', robots: { index: false } }

function Notice({ title, children, slug }: { title: string; children: React.ReactNode; slug: string }) {
  return (
    <div className="container-page max-w-2xl py-20 text-center">
      <h1 className="text-3xl">{title}</h1>
      <p className="mt-3 text-fg-muted">{children}</p>
      <Link href={`/events/${slug}`} className="mt-8 inline-block underline decoration-brand underline-offset-4">Back to the hackathon</Link>
    </div>
  )
}

export default async function SubmitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await requireUser()
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const h = await getPublicHackathon(event.id, user.id)
  if (!h) notFound()
  if (!h.joined) return <Notice slug={slug} title="Join first">Join the hackathon before you submit.</Notice>
  const now = new Date()
  const idx = h.stages.findIndex((s) => stageState(s, now) === 'open')
  const stage = h.stages[idx]
  if (!stage) return <Notice slug={slug} title="No stage is open">Submissions open with the next stage — see the timeline.</Notice>

  const [projects, mine, fields] = await Promise.all([
    listMyProjects(user.id),
    getMySubmission(h.id, user.id),
    prisma.formField.findMany({ where: { stageId: stage.id }, orderBy: { order: 'asc' } }),
  ])
  const entry = mine?.entries.find((e) => e.stageId === stage.id)
  if (idx > 0 && !mine?.entries.find((e) => e.stageId === h.stages[idx - 1]!.id)?.advancedAt) {
    return <Notice slug={slug} title={`${stage.name} is for advanced teams`}>Only teams the organisers advanced from {h.stages[idx - 1]!.name} can submit to this stage.</Notice>
  }
  return (
    <div className="container-page max-w-3xl py-14">
      <p className="text-fg-muted">{event.name}</p>
      <h1 className="mt-2 text-3xl sm:text-4xl">{h.stages.length === 1 ? 'Submit your project' : `Submit to ${stage.name}`}</h1>
      <p className="mt-2 text-fg-muted">Open until {formatEventRange(stage.closesAt, null, h.timezone)}. You can update your submission until then.</p>
      {stage.descriptionMd && <Markdown className="mt-6">{stage.descriptionMd}</Markdown>}
      <div className="mt-10 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <SubmitForm
          submitPath={`/events/${slug}/submit`}
          hackathonId={h.id}
          stageId={stage.id}
          projects={projects.map((p) => ({ id: p.id, slug: p.slug, name: p.currentVersion?.name ?? '', tagline: p.currentVersion?.shortDescription ?? '', versionNumber: p.currentVersion?.number ?? 0, sealed: !!p.currentVersion?.sealedAt, members: p._count.members, missing: p.currentVersion ? missingForSubmission(p.currentVersion) : [] }))}
          lockedProjectId={mine?.projectId ?? null}
          tracks={h.tracks}
          chooseTracks={idx === 0}
          initialTrackIds={mine?.trackIds ?? []}
          fields={fields}
          initialAnswers={(entry?.answers as Record<string, unknown>) ?? {}}
          initialPreexisting={entry?.preexistingIdea ?? false}
          initialBuilt={entry?.builtDuringEvent ?? ''}
          submittedVersion={entry?.projectVersion.number ?? null}
        />
      </div>
    </div>
  )
}
