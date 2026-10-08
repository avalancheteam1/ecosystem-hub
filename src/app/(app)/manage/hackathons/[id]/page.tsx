import { notFound } from 'next/navigation'
import { CircleCheck, CircleAlert } from 'lucide-react'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { publishChecklist } from '@/app/(site)/events/_lib/hackathons/rules'
import { requireUser } from '@/lib/guards'
import { OverviewForm } from './_components/overview-form'

export default async function ManageOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const problems = publishChecklist({ ...h, eventPublished: h.event.status === 'published' })
  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
      <section className="rounded-xl border border-line bg-surface-2 p-6 sm:p-8">
        <OverviewForm hackathonId={h.id} initial={h} />
      </section>
      <aside className="space-y-4 xl:order-last">
        <section className="rounded-xl border border-line bg-surface-2 p-6">
          <h2 className="text-lg">{problems.length ? 'Before you publish' : 'Ready to publish'}</h2>
          {problems.length === 0 ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-success"><CircleCheck className="size-4" aria-hidden /> Everything required is set up.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-2 text-fg-body"><CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> {p}</li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  )
}
