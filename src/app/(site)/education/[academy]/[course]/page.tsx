import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { KIND_LABEL, LessonIcon } from '../../_components/lesson-icon'
import { getAcademy, lessonCounts, sumCounts } from '../../_lib/content'
import { academyHref, allLessons, courseHref, lessonKind } from '../../_lib/rules'

type Props = { params: Promise<{ academy: string; course: string }> }

async function load(params: Props['params']) {
  const p = await params
  const academy = getAcademy(p.academy)
  const course = academy?.courses.find((c) => c.slug === p.course)
  return academy && course ? { academy, course } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params)
  if (!found) return {}
  return { title: `${found.course.title} - ${found.academy.title}`, description: found.course.description, ...canonical(courseHref(found.academy, found.course)) }
}

export default async function CoursePage({ params }: Props) {
  const found = await load(params)
  if (!found) notFound()
  const { academy, course } = found
  const counts = lessonCounts(academy)
  const lessons = allLessons(academy).filter((l) => l.course === course)
  const total = sumCounts(counts, lessons.map((l) => l.href))
  const index = academy.courses.indexOf(course)
  const nextCourse = academy.courses[index + 1]

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div aria-hidden className="pointer-events-none absolute -top-48 right-[-15%] h-[32rem] w-[32rem] rounded-full bg-brand/12 blur-[120px]" />
        <div aria-hidden className="dot-grid pointer-events-none absolute inset-0 opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
        <div className="container-page relative pt-8 pb-14 sm:pb-20">
          <BackLink href={academyHref(academy)}>{academy.title}</BackLink>
          <div className="mt-6 grid gap-10 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-7">
              <p className="meta animate-fade-in-up">Course {index + 1} of {academy.courses.length}</p>
              <h1 className="animate-fade-in-up mt-4 text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.02] tracking-[-0.02em] [animation-delay:80ms]">
                {course.title}<span className="text-brand">.</span>
              </h1>
              <p className="animate-fade-in-up mt-5 text-xl text-fg-heading [animation-delay:160ms]">{course.description}</p>
              <Markdown className="animate-fade-in-up mt-5 text-fg-body [animation-delay:200ms]">{course.intro}</Markdown>
            </div>
            <aside className="animate-fade-in-up self-start rounded-xl border border-line bg-surface-2/80 p-6 backdrop-blur-sm [animation-delay:280ms] sm:p-8 lg:col-span-5">
              <dl className="grid grid-cols-3 gap-4">
                {([[course.modules.length, 'modules'], [total.lessons, 'lessons'], [total.videos, 'videos']] as const).map(([n, label]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dt className="meta mt-1">{label}</dt>
                    <dd className="font-heading text-4xl font-medium tracking-[-0.03em] text-fg-heading tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
              <ol className="mt-6 space-y-2 border-t border-line pt-6">
                {course.modules.map((m) => (
                  <li key={m.slug}>
                    <a href={`#${m.slug}`} className="flex min-h-9 items-baseline gap-3 text-sm transition-colors hover:text-fg-heading">
                      <span className="meta w-20 shrink-0">{m.label}</span>
                      <span className="text-fg-body">{m.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
              <Button asChild size="lg" className="mt-6 w-full">
                <Link href={lessons[0].href}>Start the course <ArrowRight aria-hidden /></Link>
              </Button>
            </aside>
          </div>
        </div>
      </section>

      <section className="container-page space-y-6 py-14 sm:py-20">
        {course.modules.map((m) => {
          const mLessons = lessons.filter((l) => l.module === m)
          const t = sumCounts(counts, mLessons.map((l) => l.href))
          return (
            <article key={m.slug} id={m.slug} className="scroll-mt-20 overflow-hidden rounded-xl border border-line bg-surface-2">
              <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line p-6 sm:p-8">
                <div className="flex items-center gap-5">
                  <span aria-hidden className="min-w-[2ch] font-heading text-5xl font-medium tracking-[-0.04em] text-brand tabular-nums sm:text-6xl">{m.label.replace(/^Module /, '')}</span>
                  <div>
                    <p className="meta">{m.label}</p>
                    <h2 className="mt-1 text-2xl sm:text-3xl">{m.title}</h2>
                  </div>
                </div>
                <p className="meta">{t.lessons} lessons · {t.videos} videos · {t.quizzes} quiz questions</p>
              </header>
              <ol className="grid sm:grid-cols-2">
                {mLessons.map(({ lesson, href }, li) => {
                  const kind = lessonKind(counts.get(href)!)
                  return (
                    <li key={lesson.slug} className="border-line sm:odd:border-r [&:not(:last-child)]:border-b sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                      <Link href={href} className="group flex min-h-14 items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-hover/40 sm:px-8">
                        <span className="meta w-5 shrink-0 tabular-nums">{String(li + 1).padStart(2, '0')}</span>
                        <LessonIcon kind={kind} />
                        <span className="min-w-0 flex-1 text-fg-body transition-colors group-hover:text-fg-heading">{lesson.title}</span>
                        {kind !== 'reading' && <span className="meta hidden lg:inline">{KIND_LABEL[kind]}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </article>
          )
        })}

        {nextCourse && (
          <Link href={courseHref(academy, nextCourse)} className="group cta-row !mt-16">
            <span>
              <span className="meta block">Next course</span>
              {nextCourse.title}
            </span>
            <ArrowUpRight className="arrow-nudge size-8 shrink-0" aria-hidden />
          </Link>
        )}
      </section>
    </>
  )
}
