import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/metadata'
import { cn } from '@/lib/utils'
import { LessonBody } from '../../../../_components/lesson-body'
import { COURSES, readLesson } from '../../../../_lib/content'
import { findLesson } from '../../../../_lib/rules'

type Props = { params: Promise<{ course: string; module: string; lesson: string }> }

async function load(params: Props['params']) {
  const p = await params
  return findLesson(COURSES, p.course, p.module, p.lesson)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params)
  if (!found) return {}
  const { course, module, lesson, href } = found
  return {
    title: `${lesson.title} - ${module.title}`,
    description: lesson.description || `${module.label} of ${course.title}, a free team1 Entrepreneur Academy course.`,
    ...canonical(href),
  }
}

export default async function LessonPage({ params }: Props) {
  const found = await load(params)
  if (!found) notFound()
  const { course, module, lesson, prev, next } = found
  const body = await readLesson(course.slug, module.slug, lesson.slug)
  const base = `/education/entrepreneur/${course.slug}`
  return (
    <div className="container-page grid gap-10 py-10 sm:py-14 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14">
      <nav aria-label={course.title} className="order-last border-t border-line pt-8 text-sm lg:sticky lg:top-24 lg:order-first lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-0 lg:pt-0">
        <Link href={base} className="text-fg-heading hover:text-brand">{course.title}</Link>
        <ol className="mt-4 space-y-5">
          {course.modules.map((m) => (
            <li key={m.slug}>
              <p className="meta">{m.label} · {m.title}</p>
              <ol className="mt-1 border-l border-line">
                {m.lessons.map((l) => {
                  const current = m.slug === module.slug && l.slug === lesson.slug
                  return (
                    <li key={l.slug}>
                      <Link
                        href={`${base}/${m.slug}/${l.slug}`}
                        aria-current={current ? 'page' : undefined}
                        className={cn('-ml-px flex min-h-9 items-center border-l-2 pl-3 transition-colors', current ? 'border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading')}
                      >
                        {l.title}
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
      </nav>
      <article className="min-w-0">
        <p className="meta">{course.title} · {module.label} · {module.title}</p>
        <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">{lesson.title}</h1>
        {lesson.description && <p className="mt-3 max-w-[70ch] text-lg text-fg-muted">{lesson.description}</p>}
        <div className="mt-8">
          <LessonBody body={body} />
        </div>
        <div className="mt-14 grid max-w-[72ch] gap-3 border-t border-line pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={prev.href} className="group flex min-h-11 flex-col rounded-lg p-3 transition-colors hover:bg-surface-1">
              <span className="meta flex items-center gap-1"><ArrowLeft className="size-3" aria-hidden /> Previous</span>
              <span className="mt-1 text-fg-heading">{prev.lesson.title}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link href={next.href} className="group flex min-h-11 flex-col rounded-lg p-3 text-right transition-colors hover:bg-surface-1">
              <span className="meta flex items-center justify-end gap-1">Next{next.course !== course && ` course`} <ArrowRight className="size-3" aria-hidden /></span>
              <span className="mt-1 text-fg-heading">{next.course !== course ? next.course.title : next.lesson.title}</span>
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}
