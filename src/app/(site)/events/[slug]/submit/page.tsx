import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listMyProjects } from '@/app/(app)/projects/_lib/queries'
import { missingForSubmission, TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { Markdown } from '@/components/markdown'
import { COUNTRIES } from '@/lib/countries'
import { formatEventRange } from '@/lib/dates'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { getMySubmissions, getPublicHackathon } from '../../_lib/hackathons/queries'
import { advancedStageIds, pickOpenStage } from '../../_lib/hackathons/rules'
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

export default async function SubmitPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ project?: string }> }) {
  const { slug } = await params
  const { project: picked } = await searchParams
  const user = await requireUser()
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const h = await getPublicHackathon(event.id, user.id)
  if (!h) notFound()
  if (!h.joined) return <Notice slug={slug} title="Join first">Join the hackathon before you submit.</Notice>
  const now = new Date()
  const [myProjects, mines, me] = await Promise.all([listMyProjects(user.id, TEAM_ROLES), getMySubmissions(h.id, user.id), prisma.user.findUnique({ where: { id: user.id }, select: { country: true } })])
  const idx = pickOpenStage(h.stages, now, advancedStageIds(mines))
  const stage = h.stages[idx]
  if (!stage) return <Notice slug={slug} title="No stage is open">Submissions open with the next stage - see the timeline.</Notice>
  const fields = await prisma.formField.findMany({ where: { stageId: stage.id }, orderBy: { order: 'asc' } })
  // Which of my projects may be picked: later stages only advanced teams; one submission per person unless multiple are allowed.
  const advanced = idx > 0 ? mines.filter((m) => m.entries.find((e) => e.stageId === h.stages[idx - 1]!.id)?.advancedAt) : null
  if (advanced && !advanced.length) {
    return <Notice slug={slug} title={`${stage.name} is for advanced teams`}>Only teams the organisers advanced from {h.stages[idx - 1]!.name} can submit to this stage.</Notice>
  }
  const only = advanced ?? (!h.allowMultipleSubmissions && mines.length ? mines.slice(0, 1) : null)
  const projects = only ? myProjects.filter((p) => only.some((m) => m.projectId === p.id)) : myProjects
  const projectId = projects.find((p) => p.id === picked)?.id ?? projects[0]?.id ?? ''
  const mine = mines.find((m) => m.projectId === projectId)
  const entry = mine?.entries.find((e) => e.stageId === stage.id)
  return (
    <div className="container-page max-w-3xl py-14">
      <p><Link href={`/events/${slug}`} className="text-fg-muted underline-offset-4 hover:text-fg-heading hover:underline">{event.name}</Link></p>
      <h1 className="mt-2 text-3xl sm:text-4xl">{h.stages.length === 1 ? 'Submit your project' : `Submit to ${stage.name}`}</h1>
      <p className="mt-2 text-fg-muted">Open until {formatEventRange(stage.closesAt, null, h.timezone)}. You can update your submission until then.</p>
      {stage.descriptionMd && <Markdown className="mt-6">{stage.descriptionMd}</Markdown>}
      <div className="mt-10 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <SubmitForm
          key={projectId}
          submitPath={`/events/${slug}/submit`}
          hackathonId={h.id}
          stageId={stage.id}
          projects={projects.map((p) => ({ id: p.id, slug: p.slug, name: p.currentVersion?.name ?? '', tagline: p.currentVersion?.shortDescription ?? '', imageUrl: p.currentVersion?.logoUrl ?? p.currentVersion?.coverUrl ?? null, maturity: p.currentVersion?.maturity ?? null, versionNumber: p.currentVersion?.number ?? 0, sealed: !!p.currentVersion?.sealedAt, members: p._count.members, missing: p.currentVersion ? missingForSubmission(p.currentVersion) : [] }))}
          projectId={projectId}
          canCreate={!only}
          tracks={h.tracks}
          chooseTracks={idx === 0}
          initialTrackIds={mine?.trackIds ?? []}
          fields={fields}
          initialAnswers={(entry?.answers as Record<string, unknown>) ?? {}}
          initialPreexisting={entry?.preexistingIdea ?? false}
          initialBuilt={entry?.builtDuringEvent ?? ''}
          submittedVersion={entry?.projectVersion.number ?? null}
          countries={COUNTRIES}
          defaultCountry={me?.country ?? null}
        />
      </div>
    </div>
  )
}
