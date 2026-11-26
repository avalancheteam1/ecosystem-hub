import { Check, Circle, Lightbulb } from 'lucide-react'
import { SectionCard } from '@/components/section-card'

const requirements = [
  { label: 'Hub project', title: 'Start with your Hub project', suggestion: 'Choose a project you can edit and complete its details before submitting.' },
  { label: 'Working demo link', title: 'Make it easy to try', suggestion: 'Link directly to a demo or testnet deployment. Give reviewers a clear way to try one working feature.' },
  { label: 'Amount and funding summary', title: 'Start with what already works', suggestion: 'Explain what this grant will help you add to the project and who will use it.' },
  { label: 'One to three complete milestones', title: 'Make each milestone verifiable', suggestion: 'For each deliverable, name an observable result and the evidence a reviewer can use to check it.' },
  { label: 'Review saved application', title: 'Review the exact commitment', suggestion: 'Check your saved amount, dates and evidence before submitting.' },
]

export function ApplicationChecklist({ project, demo, funding = false, milestones = false, review = false }: {
  project: boolean
  demo: boolean
  funding?: boolean
  milestones?: boolean
  review?: boolean
}) {
  const complete = [project, demo, funding, milestones, review]
  const next = requirements[complete.indexOf(false)]

  return (
    <aside aria-label="Application guidance" className="min-w-0 space-y-3 lg:sticky lg:top-24">
      <SectionCard title="Before you submit" className="p-4 sm:p-5">
        <p role="status" className="mb-2 text-sm text-fg-muted">{complete.filter(Boolean).length} of {requirements.length} complete</p>
        <ul className="divide-y divide-line">
          {requirements.map(({ label }, index) => {
            const Icon = complete[index] ? Check : Circle
            return (
              <li key={label} className="flex items-start gap-2.5 py-2.5 text-sm">
                <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${complete[index] ? 'text-success' : 'text-fg-muted'}`} />
                <span className="flex-1">{label}</span>
                <span className="shrink-0 text-fg-muted">{complete[index] ? 'Done' : 'To do'}</span>
              </li>
            )
          })}
        </ul>
      </SectionCard>
      <SectionCard className="flex gap-3 p-4 sm:p-5">
        <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
        <div className="space-y-1">
          <h2 className="text-base">{next?.title ?? 'Ready to submit'}</h2>
          <p className="text-sm text-fg-muted">{next?.suggestion ?? 'Submit when you are ready to share this application with the grant team.'}</p>
        </div>
      </SectionCard>
    </aside>
  )
}
