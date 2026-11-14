import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowUpRight, Code, Scale, Tag, User } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { ToolCard } from '../_components/tool-card'
import { ToolLogo } from '../_components/tool-logo'
import { categoryLabel, getTool, TOOLING } from '../_lib/content'
import { listHref, relatedTools, toolHref } from '../_lib/rules'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).slug)
  if (!tool) return {}
  return { title: `${tool.name} · Tooling`, description: tool.purpose, ...canonical(toolHref(tool)) }
}

const formatChecked = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function Fact({ icon: Icon, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-1">
        <Icon className="size-5 text-brand" aria-hidden />
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="self-center text-fg-body">{children}</dd>
    </div>
  )
}

export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).slug)
  if (!tool) notFound()
  const category = categoryLabel(tool.category)
  const related = relatedTools(TOOLING.tools, tool)
  const builder = tool.builder.url
    ? <a href={tool.builder.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg-heading hover:underline">{tool.builder.name}</a>
    : tool.builder.name
  const categoryLink = <Link href={listHref({ category: tool.category })} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-fg-heading hover:underline">{category}</Link>

  return (
    <div className="container-page py-10 sm:py-16">
      <BackLink href="/tooling">Tooling</BackLink>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,200px)_1fr] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ToolLogo tool={tool} size={160} className="rounded-2xl" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight sm:text-5xl">{tool.name}</h1>
          <p className="mt-4 max-w-[60ch] text-lg text-fg-body">{tool.purpose}</p>
          <dl className="mt-8 space-y-4">
            <Fact icon={User} label="Built by">{builder}</Fact>
            <Fact icon={Tag} label="Category">{categoryLink}</Fact>
            <Fact icon={Scale} label="Licence">{tool.licence ? `${tool.licence} licence` : 'No licence file in the repo'}</Fact>
            <Fact icon={Code} label="Built with">{tool.language ?? 'Not stated'}</Fact>
          </dl>
          <div className="mt-8 flex flex-wrap gap-3">
            {tool.links.map((l, i) => (
              <Button key={l.url} asChild size="lg" variant={i === 0 ? 'default' : 'outline'}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} <ArrowUpRight aria-hidden /></a>
              </Button>
            ))}
          </div>
          <section className="mt-12 max-w-[68ch] border-t border-line pt-10">
            <h2 className="sr-only">About this tool</h2>
            {tool.install && (
              <>
                <h3 className="text-xl">Install</h3>
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface-1 py-2 pr-2 pl-4">
                  <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap text-fg-heading">{tool.install}</code>
                  <CopyButton value={tool.install} label="Copy install command" size="icon" />
                </div>
              </>
            )}
            {tool.note && (
              <>
                <h3 className={tool.install ? 'mt-8 text-xl' : 'text-xl'}>Good to know</h3>
                <p className="mt-3 text-fg-body">{tool.note}</p>
              </>
            )}
            <p className="mt-8 text-sm text-fg-muted">
              Checked against its repo on {formatChecked(tool.checked)}. Built by the community; team1 hasn&apos;t audited it.
            </p>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-20 border-t border-line pt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 id="related-heading" className="text-2xl">More in {category}</h2>
            <Link href={listHref({ category: tool.category })} className="inline-flex min-h-11 items-center gap-1 text-sm text-fg-muted hover:text-fg-heading">
              See all <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((t) => <li key={t.slug}><ToolCard tool={t} category={category} /></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
