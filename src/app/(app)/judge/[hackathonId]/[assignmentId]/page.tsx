import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { AnswerList } from '@/components/answer-fields'
import { BuiltDuringEvent } from '@/components/built-during-event'
import { ProjectVersionView } from '@/components/project-version-view'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/guards'
import { ReviewForm } from './review-form'

export const metadata: Metadata = { title: 'Review', robots: { index: false } }

export default async function ReviewPage({ params }: { params: Promise<{ hackathonId: string; assignmentId: string }> }) {
  const user = await requireUser()
  const { hackathonId, assignmentId } = await params
  const a = await prisma.judgeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      judge: true,
      review: true,
      entry: { include: { projectVersion: true, stage: { include: { criteria: { orderBy: { order: 'asc' } }, fields: { orderBy: { order: 'asc' } } } }, submission: { select: { trackIds: true, status: true } } } },
    },
  })
  // Only the assigned judge — never other judges or organisers through this page.
  if (!a || a.judge.userId !== user.id || a.judge.hackathonId !== hackathonId || a.entry.submission.status !== 'active') notFound()
  const next = await prisma.judgeAssignment.findFirst({
    where: { judgeId: a.judgeId, id: { not: a.id }, OR: [{ review: null }, { review: { submittedAt: null } }], entry: { stageId: a.entry.stageId, submission: { status: 'active' } } },
    select: { id: true },
  })
  const tracks = await prisma.hackathonTrack.findMany({ where: { id: { in: a.entry.submission.trackIds } }, select: { name: true } })
  const stage = a.entry.stage
  return (
    <>
      <BackLink href={`/judge/${hackathonId}`}>Queue</BackLink>
      <div className="grid gap-8 xl:grid-cols-[1fr_440px]">
        <section className="min-w-0 rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
          <p className="mb-6 text-sm text-fg-muted">{stage.name} — version {a.entry.projectVersion.number} as submitted{tracks.length ? ` — ${tracks.map((t) => t.name).join(', ')}` : ''}</p>
          <ProjectVersionView version={a.entry.projectVersion} />
          <div className="mt-8"><BuiltDuringEvent preexisting={a.entry.preexistingIdea} text={a.entry.builtDuringEvent} /></div>
          {stage.fields.length > 0 && (
            <div className="mt-10 border-t border-line pt-8">
              <AnswerList fields={stage.fields} answers={a.entry.answers as Record<string, unknown>} />
            </div>
          )}
        </section>
        <section className="self-start rounded-xl border border-line bg-surface-2 p-6 sm:p-8 xl:sticky xl:top-24">
          <h2 className="mb-6 text-lg">Your scores</h2>
          {new Date() < stage.closesAt && <p className="mb-6 rounded-lg border border-line bg-surface-1 p-3 text-sm text-fg-muted">Teams can still update this submission until the stage closes — scoring opens then.</p>}
          <ReviewForm
            assignmentId={a.id}
            criteria={stage.criteria}
            scaleMax={stage.scaleMax}
            initialScores={(a.review?.scores as Record<string, number>) ?? {}}
            initialComment={a.review?.comment ?? ''}
            locked={
              stage.judgingClosedAt ? 'Judging is closed — this review is final.'
              : a.review?.conflictDeclared ? 'You declared a conflict on this submission.'
              : new Date() < stage.closesAt ? 'Scoring opens when the stage closes.'
              : null
            }
            submitted={!!a.review?.submittedAt}
            nextHref={next ? `/judge/${hackathonId}/${next.id}` : `/judge/${hackathonId}`}
          />
        </section>
      </div>
    </>
  )
}
