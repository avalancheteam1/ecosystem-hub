import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { SectionHeading } from '@/components/section-heading'
import { canonical } from '@/lib/metadata'
import { COURSES } from '../_lib/content'

export const metadata: Metadata = {
  title: 'Entrepreneur Academy',
  description: 'Free courses on building a Web3 startup: legal and security foundations, go-to-market, community and tokenomics, fundraising and pitching.',
  ...canonical('/education/entrepreneur'),
}

export default function EntrepreneurAcademyPage() {
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Entrepreneur Academy<span className="text-brand">.</span></>}>
        Four courses on building a Web3 startup - from legal foundations to your pitch. Videos from founders and operators, flashcards and a quiz per module. Free, no sign-in.
      </SectionHeading>
      <ol className="grid gap-5 md:grid-cols-2">
        {COURSES.map((c, i) => {
          const lessons = c.modules.reduce((n, m) => n + m.lessons.length, 0)
          return (
            <li key={c.slug}>
              <Link href={`/education/entrepreneur/${c.slug}`} className="group flex h-full flex-col rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
                <p className="meta">Level {i + 1} · {c.modules.length} modules · {lessons} lessons</p>
                <h2 className="mt-3 flex items-start justify-between gap-4 text-2xl">
                  {c.title}
                  <ArrowUpRight className="arrow-nudge mt-1 size-5 shrink-0 text-brand" aria-hidden />
                </h2>
                <p className="mt-2 text-fg-muted">{c.description}</p>
                <ul className="mt-5 space-y-1 border-t border-line pt-4 text-sm text-fg-body">
                  {c.modules.map((m) => <li key={m.slug}><span className="meta mr-2">{m.label}</span>{m.title}</li>)}
                </ul>
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
