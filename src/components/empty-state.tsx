import { cn } from '@/lib/utils'

/** Dashed empty panel: what's missing + the action that fixes it. */
export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-dashed border-line p-10 text-center', className)}>
      <h2 className="text-lg">{title}</h2>
      {children && <p className="mx-auto mt-2 max-w-md text-fg-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
