import { cn } from '@/lib/utils'
import { initials } from '../_lib/rules'

/** The project's logo (an own upload), or its initials when it has none. Decorative: the name is always next to it. */
export function ToolLogo({ tool, size, className }: { tool: { name: string; logoUrl: string | null }; size: number; className?: string }) {
  return (
    <div aria-hidden style={{ width: size, height: size }} className={cn('grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-1', className)}>
      {tool.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- own CDN upload, like ProjectVersionView
        <img src={tool.logoUrl} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span className="font-heading font-medium tracking-[-0.02em] text-fg-heading" style={{ fontSize: Math.round(size * 0.34) }}>{initials(tool.name)}</span>
      )}
    </div>
  )
}
