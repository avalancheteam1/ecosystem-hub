import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { canonical } from '@/lib/metadata'
import { cn } from '@/lib/utils'
import { LessonBody } from '../../../../_components/lesson-body'
import { LessonIcon } from '../../../../_components/lesson-icon'
import { getAcademy, lessonCounts, readLesson } from '../../../../_lib/content'
import { academyHref, courseHref, findLesson, lessonKind } from '../../../../_lib/rules'

type Props = { params: Promise<{ academy: string; course: string; module: string; lesson: string }> }

async function load(params: Props['params']) {
  const p = await params
  const academy = getAcademy(p.academy)
  const found = academy && findLesson(academy, p.course, p.module, p.lesson)
  return academy && found ? { academy, ...found } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params)
  if (!found) return {}
  const { academy, course, module, lesson, href } = found
  return {
    title: `${lesson.title} - ${module.title}`,
    description: lesson.description || `${module.label} of ${course.title}, a free team1 ${academy.title} course.`,
    ...canonical(href),
  }
}

export default async function LessonPage({ params }: Props) {
  const found = await load(params)
  if (!found) notFound()
  const { academy, course, module, lesson, prev, next } = found
  const body = await readLesson(academy.slug, course.slug, module.slug, lesson.slug)
  const counts = lessonCounts(academy)
  const base = courseHref(academy, course)
  const position = module.lessons.indexOf(lesson) + 1
  return (
    <div className="container-page grid gap-10 py-8 sm:py-12 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
      <nav aria-label={course.title} className="order-last border-t border-line pt-8 text-sm lg:sticky lg:top-24 lg:order-first lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-0 lg:pt-0 lg:pr-2">
        <Link href={base} className="block font-heading text-base font-medium text-fg-heading transition-colors hover:text-brand">{course.title}</Link>
        {/* Only the current module is open - the list stays short and the current lesson in view. */}
        <ol className="mt-4 space-y-1">
          {course.modules.map((m) => (
            <li key={m.slug}>
              <details open={m === module} className="group/module">
                <summary className="flex min-h-11 list-none items-center gap-2 rounded-lg py-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 text-fg-faint transition-transform group-open/module:rotate-90" aria-hidden />
                  <span className="min-w-0">
                    <span className={cn('meta block', m === module && 'text-brand')}>{m.label}</span>
                    <span className={cn('block', m === module ? 'text-fg-heading' : 'text-fg-muted hover:text-fg-heading')}>{m.title}</span>
                  </span>
                </summary>
                <ol className="mt-1 mb-3 ml-1.5 border-l border-line">
                  {m.lessons.map((l) => {
                    const href = `${base}/${m.slug}/${l.slug}`
                    const current = l === lesson
                    return (
                      <li key={l.slug}>
                        <Link
                          href={href}
                          aria-current={current ? 'page' : undefined}
                          className={cn('-ml-px flex min-h-9 items-center gap-2.5 border-l-2 py-1 pl-3 transition-colors', current ? 'wash border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading')}
                        >
                          <LessonIcon kind={lessonKind(counts.get(href)!)} className="size-3.5" />
                          {l.title}
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              </details>
            </li>
          ))}
        </ol>
      </nav>

      <article className="min-w-0">
        <nav aria-label="Breadcrumb" className="meta flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={academyHref(academy)} className="hover:text-fg-heading">{academy.title}</Link>
          <span aria-hidden>/</span>
          <Link href={base} className="hover:text-fg-heading">{course.title}</Link>
          <span aria-hidden>/</span>
          <span className="text-fg-body">{module.label}</span>
        </nav>
        <div className="mt-6 flex max-w-[72ch] items-center gap-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-label={`Lesson ${position} of ${module.lessons.length} in ${module.title}`} aria-valuenow={position} aria-valuemin={1} aria-valuemax={module.lessons.length}>
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(position / module.lessons.length) * 100}%` }} />
          </div>
          <span className="meta shrink-0 tabular-nums">{position} / {module.lessons.length}</span>
        </div>
        <h1 className="mt-6 max-w-[24ch] text-[clamp(2rem,4.5vw,3rem)] leading-[1.08] tracking-[-0.015em]">{lesson.title}</h1>
        {lesson.description && <p className="mt-4 max-w-[60ch] text-lg text-fg-muted">{lesson.description}</p>}
        <div className="mt-10 border-t border-line pt-10">
          <LessonBody body={body} quizzes={academy.quizzes} flashcards={academy.flashcards} />
        </div>

        <div className="mt-16 grid max-w-[72ch] gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={prev.href} className="group flex min-h-20 flex-col justify-center rounded-xl border border-line p-4 transition duration-200 hover:border-brand">
              <span className="meta flex items-center gap-1.5"><ArrowLeft className="size-3 transition-transform group-hover:-translate-x-0.5" aria-hidden /> Previous</span>
              <span className="mt-1 text-fg-heading">{prev.lesson.title}</span>
            </Link>
          ) : <span className="hidden sm:block" />}
          {next && (
            <Link href={next.href} className="group flex min-h-20 flex-col justify-center rounded-xl border border-line bg-surface-2 p-4 text-right transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
              <span className="meta flex items-center justify-end gap-1.5">{next.course !== course ? 'Next course' : next.module !== module ? 'Next module' : 'Next'} <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="mt-1 text-fg-heading">{next.course !== course ? next.course.title : next.module !== module ? `${next.module.label} · ${next.module.title}` : next.lesson.title}</span>
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}
