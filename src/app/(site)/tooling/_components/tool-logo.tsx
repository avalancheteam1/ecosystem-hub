import Image from 'next/image'
import { cn } from '@/lib/utils'
import { initials, type Tool } from '../_lib/rules'

/** The tool's logo (a file in `public/tooling/`), or its initials when it has none. Decorative: the name is always next to it. */
export function ToolLogo({ tool, size, className }: { tool: Pick<Tool, 'name' | 'logo'>; size: number; className?: string }) {
  return (
    <div aria-hidden style={{ width: size, height: size }} className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-1', className)}>
      {tool.logo ? (
        <Image src={tool.logo} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="font-heading font-medium tracking-[-0.02em] text-fg-heading" style={{ fontSize: Math.round(size * 0.34) }}>{initials(tool.name)}</span>
      )}
    </div>
  )
}
