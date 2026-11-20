import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { pageParam, textParam } from '@/lib/params'
import { ToolCard } from './_components/tool-card'
import { listPublicTools } from './_lib/queries'
import { QUERY_MAX, viewTools } from './_lib/rules'

export const metadata: Metadata = {
  title: 'Tooling',
  description: 'Developer tools built by Avalanche builders, reviewed by team1 before they are listed.',
  ...canonical('/tooling'),
}

export default async function ToolingPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams
  const q = textParam(sp.q, QUERY_MAX)
  const all = await listPublicTools()
  const view = viewTools(all, { q, page: pageParam(sp.page) })
  const total = all.length
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Tooling<span className="text-brand">.</span></>}>
        Developer tools built by Avalanche builders. team1 reviews each project before it is listed, but hasn&apos;t audited the code.
      </SectionHeading>

      {/* keyed on the view: links (clear, pager, back/forward) reset any unsubmitted text in the box */}
      {total > 0 && <SearchForm key={`${q ?? ''}#${view.page}`} q={q} placeholder="Search tools" />}

      {view.tools.length > 0 ? (
        <>
          <p className="meta mt-8" aria-live="polite">
            {q ? `${view.found} of ${total} ${total === 1 ? 'tool' : 'tools'} match “${q}”` : `${total} ${total === 1 ? 'tool' : 'tools'}`}
          </p>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {view.tools.map((t) => <li key={t.slug}><ToolCard tool={t} /></li>)}
          </ul>
        </>
      ) : (
        <EmptyState
          className="mt-8"
          title={total === 0 ? 'No tools listed yet' : `No tools match “${q}”`}
          action={q && <Button asChild variant="outline"><Link href="/tooling">Clear search</Link></Button>}
        >
          {total === 0 ? 'Builders’ projects show up here once team1 has reviewed them.' : 'Try fewer or different words.'}
        </EmptyState>
      )}
      <Pager page={view.page} hasMore={view.hasMore} params={{ q }} />

      <section aria-labelledby="submit-heading" className="mt-20 border-t border-line pt-12">
        <h2 id="submit-heading" className="text-2xl">Built a tool?</h2>
        <p className="mt-2 max-w-[60ch] text-fg-muted">
          Submit your hub project if it is live and in the “Developer Tooling” category. team1 reviews it before it is listed.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/tooling/submit">Submit your project <ArrowRight aria-hidden /></Link>
        </Button>
      </section>
    </div>
  )
}
