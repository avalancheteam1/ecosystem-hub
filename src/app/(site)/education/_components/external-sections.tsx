import { ArrowUpRight, Clock, Plus } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { AVAX_ACADEMY, AVAX_COURSE_BASE, AVAX_COURSES, WORKSHOPS, WORKSHOPS_REPO, workshopHref, type AvaxCourse, type Workshop } from '../_lib/external'

const LEVEL_STEP: Record<Workshop['level'], number> = { beginner: 1, intermediate: 2, advanced: 3 }
const STAGE_STEP: Record<AvaxCourse['stage'], number> = { Foundations: 1, Core: 2, Advanced: 3 }

const card = 'group flex h-full flex-col rounded-xl border border-line bg-surface-2 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow'

/** Three bars, filled up to `step` - difficulty at a glance. */
function Meter({ step, label }: { step: number; label: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-fg-muted">
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3].map((i) => <span key={i} className={`h-2.5 w-1.5 rounded-sm ${i <= step ? 'bg-brand' : 'bg-line'}`} />)}
      </span>
      <span className="capitalize">{label}</span>
    </span>
  )
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-brand hover:underline">
      {children}
      <ArrowUpRight className="size-4" aria-hidden />
    </a>
  )
}

export function WorkshopsSection() {
  return (
    <section aria-labelledby="workshops" className="scroll-mt-20 border-t border-line">
      <div className="container-page py-16 sm:py-20">
        <SectionHeading id="workshops" title={<>Workshops<span className="text-brand">.</span></>}>
          Hands-on sessions from team1 chapters: a README to follow top to bottom, with the code, slides and recordings. Run one at your meetup or work through it alone.
          <br />
          <SourceLink href={WORKSHOPS_REPO}>All workshops on GitHub</SourceLink>
        </SectionHeading>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {WORKSHOPS.map((w, i) => (
            <li key={w.slug}>
              <a href={workshopHref(w)} target="_blank" rel="noreferrer" className={`${card} p-6`}>
                <div className="flex items-start justify-between gap-4">
                  <span className="meta tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  <ArrowUpRight className="arrow-nudge size-5 shrink-0 text-brand" aria-hidden />
                </div>
                <h3 className="mt-6 text-xl leading-snug text-fg-heading">{w.title}</h3>
                <div className="mt-auto pt-8">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4">
                    <Meter step={LEVEL_STEP[w.level]} label={w.level} />
                    <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                      <Clock className="size-3.5" aria-hidden />
                      {w.duration}
                      {w.languages.length > 1 && <span className="text-fg-faint">· {w.languages.map((l) => l.toUpperCase()).join(' ')}</span>}
                    </span>
                  </div>
                </div>
              </a>
            </li>
          ))}
          <li>
            <a href={`${WORKSHOPS_REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer" className="flex h-full min-h-48 flex-col justify-center rounded-xl border border-dashed border-line p-6 text-fg-muted transition duration-200 hover:border-brand hover:text-fg-body">
              <Plus className="size-6 text-brand" aria-hidden />
              <span className="mt-4 text-lg text-fg-heading">Add your workshop</span>
              <span className="mt-1 text-sm">Write a new one or translate an existing one.</span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  )
}

export function AvaxAcademySection() {
  return (
    <section aria-labelledby="avalanche-academy" className="scroll-mt-20 border-t border-line bg-surface-1/40">
      <div className="container-page py-16 sm:py-20">
        <SectionHeading id="avalanche-academy" title={<>Avalanche Academy<span className="text-brand">.</span></>}>
          The technical courses on build.avax.network, from blockchain basics to launching and connecting your own L1. Free, at your own pace.
          <br />
          <SourceLink href={AVAX_ACADEMY}>Open the Avalanche Academy</SourceLink>
        </SectionHeading>
        <ol className="grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-5">
          {AVAX_COURSES.map((g, i) => (
            <li key={g.part}>
              <h3 className="flex items-baseline gap-3 border-b border-line pb-3">
                <span className="meta tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-lg text-fg-heading">{g.part}</span>
              </h3>
              <ul className="mt-4 grid gap-3">
                {g.courses.map((c) => (
                  <li key={c.slug}>
                    <a href={`${AVAX_COURSE_BASE}/${c.slug}`} target="_blank" rel="noreferrer" className={`${card} p-4`}>
                      <span className="flex items-start justify-between gap-3 text-fg-heading">
                        {c.title}
                        <ArrowUpRight className="arrow-nudge mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                      </span>
                      <span className="mt-1 text-sm text-fg-muted">{c.description}</span>
                      <span className="mt-auto pt-4"><Meter step={STAGE_STEP[c.stage]} label={c.stage} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
