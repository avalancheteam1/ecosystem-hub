import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { BackLink } from '@/components/back-link'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { ToolLogo } from '../_components/tool-logo'
import { getPublicTool } from '../_lib/queries'
import { toolHref, toolLinks } from '../_lib/rules'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = await getPublicTool((await params).slug)
  if (!tool) return {}
  return { title: `${tool.version.name} · Tooling`, description: tool.version.shortDescription, ...canonical(toolHref(tool)) }
}

const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** A listed tool: the version team1 approved, project data only (no team). */
export default async function ToolPage({ params }: Props) {
  const tool = await getPublicTool((await params).slug)
  if (!tool) notFound()
  const v = tool.version
  const links = toolLinks(v)
  return (
    <div className="container-page py-10 sm:py-16">
      <BackLink href="/tooling">Tooling</BackLink>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,200px)_1fr] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ToolLogo tool={v} size={160} className="rounded-2xl" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl leading-tight sm:text-5xl">{v.name}</h1>
          <p className="mt-4 max-w-[60ch] text-lg text-fg-body">{v.shortDescription}</p>
          {links.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {links.map((l, i) => (
                <Button key={l.url} asChild size="lg" variant={i === 0 ? 'default' : 'outline'}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer nofollow">{l.label} <ArrowUpRight aria-hidden /></a>
                </Button>
              ))}
            </div>
          )}
          <section className="mt-12 max-w-[68ch] border-t border-line pt-10">
            <h2 className="text-xl">About</h2>
            <Markdown className="mt-3">{v.fullDescription}</Markdown>
            {v.techDescription.trim() && (
              <>
                <h2 className="mt-10 text-xl">How it’s made</h2>
                <Markdown className="mt-3">{v.techDescription}</Markdown>
              </>
            )}
            <p className="mt-10 text-sm text-fg-muted">
              {tool.approvedAt && <>Reviewed by team1 on {formatDate(tool.approvedAt)}. </>}Built by the community; team1 hasn&apos;t audited it.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
