import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { toolHref, type PublicTool } from '../_lib/rules'
import { ToolLogo } from './tool-logo'

/** List tile: logo, name and short description. The whole card opens the tool page. */
export function ToolCard({ tool }: { tool: PublicTool }) {
  return (
    <Link href={toolHref(tool)} className="group flex h-full flex-col rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <ToolLogo tool={tool} size={64} />
        <ArrowUpRight className="arrow-nudge size-5 shrink-0 text-brand" aria-hidden />
      </div>
      <h3 className="mt-5 text-xl leading-snug transition-colors group-hover:text-brand">{tool.name}</h3>
      <p className="mt-2 line-clamp-3 text-fg-muted">{tool.shortDescription}</p>
    </Link>
  )
}
