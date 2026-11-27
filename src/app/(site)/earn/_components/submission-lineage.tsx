import Link from 'next/link'
import { SectionCard } from '@/components/section-card'

type Entry = { id: string; revision: number; stage: { title: string; position: number } }

export function SubmissionLineage({ entries, hrefPrefix }: { entries: Entry[]; hrefPrefix: string }) {
  if (entries.length < 2) return null
  return (
    <SectionCard title="Submission lineage">
      <ol className="space-y-2">
        {entries.map(({ id, revision, stage }, index) => {
          const label = `Stage ${stage.position}: ${stage.title} · revision ${revision}`
          return (
            <li key={id} className="wrap-anywhere">
              {index === entries.length - 1
                ? <span aria-current="step">{label}</span>
                : <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={`${hrefPrefix}/${id}`}>{label}</Link>}
            </li>
          )
        })}
      </ol>
    </SectionCard>
  )
}
