import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ArrowUpRight, Layers, ListChecks, PlayCircle } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { getAcademy, lessonCounts, sumCounts } from '../_lib/content'
import { academyHref, allLessons, courseHref } from '../_lib/rules'

type Props = { params: Promise<{ academy: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const academy = getAcademy((await params).academy)
  if (!academy) return {}
  return { title: academy.title, description: academy.description, ...canonical(academyHref(academy)) }
}

const HOW = [
  { icon: PlayCircle, title: 'Watch', body: 'Short videos from founders, investors and operators - between the reading, where they fit.' },
  { icon: Layers, title: 'Review', body: 'Flashcards with the key terms of each module, each with a real-world example.' },
  { icon: ListChecks, title: 'Test', body: 'A quiz closes every module. Wrong answer? You get a hint and a fresh question.' },
]

export default async function AcademyPage({ params }: Props) {
  const academy = getAcademy((await params).academy)
  if (!academy) notFound()
  const counts = lessonCounts(academy)
  const lessons = allLessons(academy)
  const total = sumCounts(counts, lessons.map((l) => l.href))
  const modules = academy.courses.reduce((n, c) => n + c.modules.length, 0)

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10%] h-[36rem] w-[36rem] rounded-full bg-brand/15 blur-[120px]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="container-page relative pt-8 pb-16 sm:pb-24">
          <BackLink href="/education">Education</BackLink>
          <div className="mt-6 grid gap-12 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="meta animate-fade-in-up">Academy · free · no sign-in needed</p>
              <h1 className="animate-fade-in-up mt-4 text-[clamp(2.75rem,7vw,5rem)] leading-[1.02] tracking-[-0.02em] [animation-delay:80ms]">
                {academy.title}<span className="text-brand">.</span>
              </h1>
              <p className="animate-fade-in-up mt-5 text-xl text-fg-heading [animation-delay:160ms] sm:text-2xl">{academy.tagline}</p>
              <p className="animate-fade-in-up mt-4 max-w-[56ch] text-lg text-fg-body [animation-delay:200ms]">{academy.description}</p>
              <div className="animate-fade-in-up mt-10 flex flex-col gap-3 [animation-delay:280ms] sm:flex-row">
                <Button asChild size="lg"><Link href={lessons[0].href}>Start the first course <ArrowRight aria-hidden /></Link></Button>
                <Button asChild size="lg" variant="outline"><a href="#curriculum">See the curriculum</a></Button>
              </div>
            </div>
            <dl className="animate-fade-in-up grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface-2/80 backdrop-blur-sm [animation-delay:320ms] lg:col-span-5 [&>div]:border-line [&>div:nth-child(even)]:border-l [&>div:nth-child(n+3)]:border-t">
              {([[academy.courses.length, 'courses'], [modules, 'modules'], [total.videos, 'videos'], [total.quizzes, 'quiz questions']] as const).map(([n, label]) => (
                <div key={label} className="flex flex-col-reverse p-5 sm:p-6">
                  <dt className="meta mt-1">{label}</dt>
                  <dd className="font-heading text-4xl font-medium tracking-[-0.03em] text-fg-heading tabular-nums sm:text-5xl">{n}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="curriculum" className="container-page scroll-mt-20 py-16 sm:py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.012em]">The curriculum<span className="text-brand">.</span></h2>
          <p className="meta">{academy.courses.length} courses · in order, or pick the one you need</p>
        </div>
        <ol className="relative space-y-5">
          <span aria-hidden className="absolute top-14 bottom-14 left-[27px] hidden w-px bg-brand/40 sm:block" />
          {academy.courses.map((c, i) => {
            const t = sumCounts(counts, lessons.filter((l) => l.course === c).map((l) => l.href))
            return (
              <li key={c.slug} className="relative sm:pl-20">
                <span aria-hidden className="absolute top-7 left-0 hidden size-14 place-items-center rounded-full border border-brand bg-surface-0 font-heading text-lg font-medium text-fg-heading tabular-nums sm:grid">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Link href={courseHref(academy, c)} className="group grid gap-6 rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow sm:p-8 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-10">
                  <div>
                    <p className="meta"><span className="sm:hidden">Course {i + 1} · </span>{c.modules.length} modules · {t.lessons} lessons · {t.videos} videos</p>
                    <h3 className="mt-3 flex items-start justify-between gap-4 text-2xl sm:text-3xl">
                      {c.title}
                      <ArrowUpRight className="arrow-nudge mt-1 size-6 shrink-0 text-brand" aria-hidden />
                    </h3>
                    <p className="mt-3 max-w-[60ch] text-fg-muted">{c.description}</p>
                  </div>
                  <ul className="space-y-2 self-center border-t border-line pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
                    {c.modules.map((m) => (
                      <li key={m.slug} className="flex items-baseline gap-3 text-sm">
                        <span className="meta w-20 shrink-0">{m.label}</span>
                        <span className="text-fg-body">{m.title}</span>
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            )
          })}
        </ol>
      </section>

      <section className="border-t border-line bg-surface-1/50">
        <div className="container-page py-16 sm:py-20">
          <h2 className="text-2xl">How each module works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {HOW.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-2"><Icon className="size-5 text-brand" aria-hidden /></span>
                <div>
                  <p className="meta">Step {i + 1}</p>
                  <h3 className="mt-1 text-lg">{title}</h3>
                  <p className="mt-1 text-fg-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          {academy.credit && (
            <p className="mt-12 text-sm text-fg-muted">
              Course content adapted from the <a href={academy.credit.url} className="underline underline-offset-4 hover:text-fg-heading">{academy.credit.name}</a>, used under the {academy.credit.license}.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
