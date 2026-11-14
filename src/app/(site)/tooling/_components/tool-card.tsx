import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { toolHref, type Tool } from '../_lib/rules'
import { ToolLogo } from './tool-logo'

/** List tile: logo, category, name, one-line purpose, builder and licence. The whole card opens the tool page. */
export function ToolCard({ tool, category }: { tool: Tool; category: string }) {
  return (
    <Link href={toolHref(tool)} className="group flex h-full flex-col rounded-xl border border-line bg-surface-2 p-6 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <ToolLogo tool={tool} size={64} />
        <ArrowUpRight className="arrow-nudge size-5 shrink-0 text-brand" aria-hidden />
      </div>
      <p className="meta mt-5">{category}</p>
      <h3 className="mt-1.5 text-xl leading-snug transition-colors group-hover:text-brand">{tool.name}</h3>
      <p className="mt-2 line-clamp-3 text-fg-muted">{tool.purpose}</p>
      <p className="mt-auto flex flex-wrap justify-between gap-x-4 gap-y-1 pt-6 text-sm text-fg-faint">
        <span className="truncate">by {tool.builder.name}</span>
        <span>{tool.licence ? `${tool.licence} licence` : 'No licence'}</span>
      </p>
    </Link>
  )
}
