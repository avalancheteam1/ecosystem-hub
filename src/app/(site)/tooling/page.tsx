import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { pageParam, textParam } from '@/lib/params'
import { cn } from '@/lib/utils'
import { ToolCard } from './_components/tool-card'
import { categoryLabel, TOOLING } from './_lib/content'
import { listHref, QUERY_MAX, viewTools } from './_lib/rules'

export const metadata: Metadata = {
  title: 'Tooling',
  description: 'Tools built by Avalanche community members, with their code in the open: SDKs, web tools and bots.',
  ...canonical('/tooling'),
}

const ADD_TOOL_URL = 'https://github.com/avalancheteam1/ecosystem-hub/blob/main/src/app/(site)/tooling/AGENTS.md'

export default async function ToolingPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; category?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams
  const q = textParam(sp.q, QUERY_MAX)
  const view = viewTools(TOOLING, { q, category: textParam(sp.category), page: pageParam(sp.page) })
  const total = TOOLING.tools.length
  const inCategory = view.category ? ` in ${categoryLabel(view.category)}` : ''
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading title={<>Tooling<span className="text-brand">.</span></>}>
        Tools built by Avalanche community members, with their code in the open. Each one is checked against its repo before it is listed; team1 hasn&apos;t audited them.
      </SectionHeading>

      {/* keyed on the view: links (chips, clear, pager, back/forward) reset any unsubmitted text in the box */}
      {total > 0 && <SearchForm key={`${listHref({ q, category: view.category })}#${view.page}`} q={q} placeholder="Search tools" keep={view.category ? { category: view.category } : undefined} />}
      {view.chips.length > 1 && (
        <nav aria-label="Tool categories" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ slug: undefined, label: 'All', count: view.found }, ...view.chips].map((c) => (
            <Link
              key={c.slug ?? 'all'}
              href={listHref({ q, category: c.slug })}
              aria-current={view.category === c.slug ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors',
                view.category === c.slug ? 'border-brand bg-brand/10 text-fg-heading' : 'border-line text-fg-muted hover:border-fg-faint hover:text-fg-heading',
              )}
            >
              {c.label}
              <span className="text-fg-faint tabular-nums">{c.count}</span>
            </Link>
          ))}
        </nav>
      )}

      {view.tools.length > 0 ? (
        <>
          <p className="meta mt-8" aria-live="polite">
            {view.shown === total ? `${total} ${total === 1 ? 'tool' : 'tools'}` : `${view.shown} of ${total} tools`}
            {q && ` match “${q}”`}
          </p>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {view.tools.map((t) => (
              <li key={t.slug}><ToolCard tool={t} category={categoryLabel(t.category)} /></li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          className="mt-8"
          title={total === 0 ? 'No tools listed yet' : `No tools${inCategory} match “${q}”`}
          action={q && (
            <div className="flex flex-wrap justify-center gap-3">
              {view.category && view.found > 0 && <Button asChild variant="outline"><Link href={listHref({ q })}>Search all categories</Link></Button>}
              <Button asChild variant="outline"><Link href={listHref({ category: view.category })}>Clear search</Link></Button>
            </div>
          )}
        >
          {total === 0 ? 'Community tools will show up here once they are added.' : 'Try fewer or different words.'}
        </EmptyState>
      )}
      <Pager page={view.page} hasMore={view.hasMore} params={{ q, category: view.category }} />

      <section aria-labelledby="official-heading" className="mt-20 grid gap-8 border-t border-line pt-12 lg:grid-cols-2">
        <div>
          <h2 id="official-heading" className="text-2xl">Official tools</h2>
          <p className="mt-2 max-w-[52ch] text-fg-muted">Built and run by team1 and Ava Labs.</p>
          <ul className="mt-6 flex flex-wrap gap-3">
            {TOOLING.official.map((l) => (
              <li key={l.url}>
                <Button asChild variant="outline">
                  <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} <ArrowUpRight aria-hidden /></a>
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-2xl">Built a tool?</h2>
          <p className="mt-2 max-w-[52ch] text-fg-muted">
            Tools for Avalanche builders are listed by pull request. team1 checks the repo, licence and docs before merging.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <a href={ADD_TOOL_URL} target="_blank" rel="noopener noreferrer">How to add your tool <ArrowUpRight aria-hidden /></a>
          </Button>
        </div>
      </section>
    </div>
  )
}
