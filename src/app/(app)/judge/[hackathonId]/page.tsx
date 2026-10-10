import type { Metadata } from 'next'
import Link from 'next/link'
import { BackLink } from '@/components/back-link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { DataTerms } from '@/app/(site)/events/_components/hackathon/data-terms'
import { getJudgeQueue } from '@/app/(site)/events/_lib/hackathons/queries'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { requireUser } from '@/lib/guards'

export const metadata: Metadata = { title: 'Review queue', robots: { index: false } }

export default async function JudgeQueue({ params }: { params: Promise<{ hackathonId: string }> }) {
  const user = await requireUser()
  const { hackathonId } = await params
  const q = await getJudgeQueue(hackathonId, user.id)
  if (!q) notFound()
  if (!q.judge.termsAcceptedAt) {
    return (
      <>
        <BackLink href="/judge">Judging</BackLink>
        <PageHeader title={q.judge.hackathon.event.name} description="One step before you start judging." />
        <DataTerms hackathonId={hackathonId} role="judge" />
      </>
    )
  }
  const stages = [...new Map(q.assignments.map((a) => [a.entry.stage.id, a.entry.stage])).values()].sort((a, b) => a.order - b.order)
  return (
    <>
      <BackLink href="/judge">Judging</BackLink>
      <PageHeader title={q.judge.hackathon.event.name} description="Score each submission on every criterion. Your scores stay private until the organisers close the round." />
      {stages.length === 0 && <p className="text-fg-muted">Nothing assigned to you yet - submissions show up here once they close.</p>}
      <div className="space-y-8">
        {stages.map((s) => {
          const items = q.assignments.filter((a) => a.entry.stage.id === s.id)
          const done = items.filter((a) => a.review?.submittedAt).length
          return (
            <section key={s.id}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg">{s.name}</h2>
                <p className="text-sm text-fg-muted">{done}/{items.length} done{s.judgingClosedAt ? ' - closed' : ''}</p>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
                {items.map((a) => (
                  <li key={a.id}>
                    <Link href={`/judge/${hackathonId}/${a.id}`} className="flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-surface-hover">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-fg-heading">{a.entry.projectVersion.name}</p>
                        <p className="truncate text-sm text-fg-muted">{a.entry.projectVersion.shortDescription}</p>
                      </div>
                      {a.review?.conflictDeclared ? <StatusPill tone="warning">Conflict</StatusPill> : a.review?.submittedAt ? <StatusPill tone="success">Submitted{a.review.total != null ? ` - ${a.review.total}` : ''}</StatusPill> : a.review ? <StatusPill tone="info">Draft</StatusPill> : <StatusPill tone="brand">To do</StatusPill>}
                      <ChevronRight className="size-4 text-fg-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}
