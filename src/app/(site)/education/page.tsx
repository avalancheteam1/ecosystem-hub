import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { canonical } from '@/lib/metadata'
import { ACADEMIES, lessonCounts, sumCounts } from './_lib/content'
import { academyHref } from './_lib/rules'

export const metadata: Metadata = {
  title: 'Education',
  description: 'Free academies from team1 for builders in the Avalanche ecosystem - video courses, flashcards and quizzes.',
  ...canonical('/education'),
}

export default function EducationPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[32rem] w-[32rem] rounded-full bg-brand/15 blur-[120px]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="container-page relative py-20 sm:py-28">
          <p className="meta animate-fade-in-up">Education · free · no sign-in needed</p>
          <h1 className="animate-fade-in-up mt-4 max-w-[14ch] text-[clamp(2.75rem,7vw,5rem)] leading-[1.02] tracking-[-0.02em] [animation-delay:80ms]">
            Learn what it takes to build<span className="text-brand">.</span>
          </h1>
          <p className="animate-fade-in-up mt-6 max-w-[52ch] text-lg text-fg-body [animation-delay:160ms] sm:text-xl">
            Academies from team1 and the Avalanche ecosystem: short videos from people who have done it, flashcards to lock it in and a quiz per module.
          </p>
        </div>
      </section>

      <section className="container-page py-16 sm:py-20">
        <ul className="grid gap-6">
          {ACADEMIES.map((a, i) => {
            const t = sumCounts(lessonCounts(a), [...lessonCounts(a).keys()])
            return (
              <li key={a.slug} className="animate-fade-in-up" style={{ animationDelay: `${240 + i * 80}ms` }}>
                <Link href={academyHref(a)} className="group relative grid overflow-hidden rounded-xl border border-line bg-surface-2 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow lg:grid-cols-[1.1fr_1fr]">
                  <div className="p-6 sm:p-10">
                    <p className="meta">Academy · {a.courses.length} courses</p>
                    <h2 className="mt-3 flex items-start justify-between gap-4 text-3xl sm:text-4xl">
                      {a.title}
                      <ArrowUpRight className="arrow-nudge mt-1 size-7 shrink-0 text-brand" aria-hidden />
                    </h2>
                    <p className="mt-2 text-xl text-fg-heading">{a.tagline}</p>
                    <p className="mt-4 max-w-[52ch] text-fg-muted">{a.description}</p>
                    <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
                      {([[t.lessons, 'lessons'], [t.videos, 'videos'], [t.quizzes, 'quiz questions']] as const).map(([n, l]) => (
                        <div key={l} className="flex items-baseline gap-2">
                          <dt className="sr-only">{l}</dt>
                          <dd className="font-heading text-3xl font-medium tracking-[-0.03em] text-fg-heading tabular-nums">{n}</dd>
                          <span aria-hidden className="meta">{l}</span>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <ol className="border-t border-line bg-surface-1/60 p-6 sm:p-10 lg:border-t-0 lg:border-l">
                    {a.courses.map((c, ci) => (
                      <li key={c.slug} className="flex items-baseline gap-4 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
                        <span className="meta w-6 shrink-0 tabular-nums">{String(ci + 1).padStart(2, '0')}</span>
                        <span className="text-fg-heading">{c.title}</span>
                      </li>
                    ))}
                  </ol>
                </Link>
              </li>
            )
          })}
          <li className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center text-fg-muted">
            More academies are on the way.
          </li>
        </ul>
      </section>
    </>
  )
}
