import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { COURSES } from '../../_lib/content'

type Props = { params: Promise<{ course: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).course
  const course = COURSES.find((c) => c.slug === slug)
  if (!course) return {}
  return { title: `${course.title} - Entrepreneur Academy`, description: course.description, ...canonical(`/education/entrepreneur/${course.slug}`) }
}

export default async function CoursePage({ params }: Props) {
  const slug = (await params).course
  const course = COURSES.find((c) => c.slug === slug)
  if (!course) notFound()
  const base = `/education/entrepreneur/${course.slug}`
  const first = course.modules[0]
  return (
    <div className="container-page py-10 sm:py-16">
      <BackLink href="/education/entrepreneur">Entrepreneur Academy</BackLink>
      <p className="meta">Level {COURSES.indexOf(course) + 1}</p>
      <h1 className="mt-2 text-3xl leading-tight sm:text-5xl">{course.title}</h1>
      <p className="mt-3 max-w-[70ch] text-lg text-fg-muted">{course.description}</p>
      <Markdown className="mt-6">{course.intro}</Markdown>
      <Button asChild size="lg" className="mt-8">
        <Link href={`${base}/${first.slug}/${first.lessons[0].slug}`}>Start the course</Link>
      </Button>
      <ol className="mt-14 space-y-10">
        {course.modules.map((m) => (
          <li key={m.slug} className="border-t border-line pt-6">
            <p className="meta">{m.label}</p>
            <h2 className="mt-1 text-2xl">{m.title}</h2>
            <ol className="mt-4 grid gap-x-8 sm:grid-cols-2">
              {m.lessons.map((l) => (
                <li key={l.slug}>
                  <Link href={`${base}/${m.slug}/${l.slug}`} className="flex min-h-11 items-center text-fg-body transition-colors hover:text-fg-heading">{l.title}</Link>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}
