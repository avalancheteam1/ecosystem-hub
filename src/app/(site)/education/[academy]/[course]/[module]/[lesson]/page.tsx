import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Award, CheckCircle2, ChevronRight } from 'lucide-react'
import { canonical } from '@/lib/metadata'
import { getCurrentUser } from '@/lib/session'
import { cn } from '@/lib/utils'
import { LessonBody } from '../../../../_components/lesson-body'
import { LessonIcon } from '../../../../_components/lesson-icon'
import { RecordVisit } from '../../../../_components/record-visit'
import { SyncLocalProgress } from '../../../../_components/sync-local-progress'
import { getAcademy, lessonCounts, progressLessons, readLesson } from '../../../../_lib/content'
import { getCertificateIds, getProgress, getQuizAttempts } from '../../../../_lib/queries'
import { academyHref, courseHref, findLesson, lessonDone, lessonKind, progressOf } from '../../../../_lib/rules'

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
  const [body, user] = await Promise.all([readLesson(academy.slug, course.slug, module.slug, lesson.slug), getCurrentUser()])
  const courseLessons = progressLessons(academy).filter((l) => l.course === course)
  const lastOfCourse = courseLessons.at(-1)!.lesson === lesson
  const [progress, attempts, certIds] = user
    ? await Promise.all([getProgress(user.id, academy.slug), getQuizAttempts(user.id, academy.slug), lastOfCourse ? getCertificateIds(user.id, academy.slug) : null])
    : [null, null, null]
  const counts = lessonCounts(academy)
  const byHref = new Map(courseLessons.map((l) => [l.href, l]))
  const courseProgress = progress && progressOf(progress, courseLessons)
  const certId = certIds?.get(course.slug)
  const base = courseHref(academy, course)
  const position = module.lessons.indexOf(lesson) + 1
  return (
    <div className="container-page grid gap-10 py-8 sm:py-12 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
      <nav aria-label={course.title} className="order-last border-t border-line pt-8 text-sm lg:sticky lg:top-24 lg:order-first lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:border-0 lg:pt-0 lg:pr-2">
        <RecordVisit academy={academy.slug} course={course.slug} module={module.slug} lesson={lesson.slug} signedIn={!!user} />
        {user && <SyncLocalProgress academy={academy.slug} />}
        <Link href={base} className="block font-heading text-base font-medium text-fg-heading transition-colors hover:text-brand">{course.title}</Link>
        {courseProgress && <p className="meta mt-1 tabular-nums">{courseProgress.done} of {courseProgress.total} lessons done</p>}
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
                    const done = progress && lessonDone(progress, byHref.get(href)!)
                    return (
                      <li key={l.slug}>
                        <Link
                          href={href}
                          aria-current={current ? 'page' : undefined}
                          className={cn('-ml-px flex min-h-9 items-center gap-2.5 border-l-2 py-1 pl-3 transition-colors', current ? 'wash border-brand text-fg-heading' : 'border-transparent text-fg-muted hover:text-fg-heading')}
                        >
                          {done ? <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden /> : <LessonIcon kind={lessonKind(counts.get(href)!)} className="size-3.5" />}
                          {l.title}
                          {done && <span className="sr-only">(done)</span>}
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
          <LessonBody body={body} academy={academy.slug} quizzes={academy.quizzes} flashcards={academy.flashcards} user={progress && attempts ? { passed: progress.passed, attempts } : null} />
        </div>

        {lastOfCourse && (
          <Link href={certId ? `/education/certificates/${certId}` : `${base}#certificate`} className="group mt-16 flex max-w-[72ch] items-center gap-4 rounded-xl border border-brand/40 bg-brand/5 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
            <Award className="size-6 shrink-0 text-brand" aria-hidden />
            <span className="flex-1">
              <span className="block text-fg-heading">End of {course.title}</span>
              <span className="text-sm text-fg-muted">{certId ? 'You have the certificate for this course - view or download it.' : courseProgress?.complete ? 'Every lesson and quiz done - get your certificate on the course page.' : user ? 'Finish every lesson and quiz to get your certificate on the course page.' : 'Sign in to save your progress and earn a certificate.'}</span>
            </span>
            <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}

        <div className={cn('grid max-w-[72ch] gap-3 sm:grid-cols-2', lastOfCourse ? 'mt-3' : 'mt-16')}>
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
