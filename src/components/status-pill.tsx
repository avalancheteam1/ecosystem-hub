import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const TONE = {
  neutral: 'bg-surface-hover text-fg-muted',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
  info: 'bg-info/15 text-info',
  brand: 'bg-brand/15 text-brand',
} as const

/** Small rounded status label. Use instead of ad-hoc coloured badges. */
export function StatusPill({ tone = 'neutral', children, className }: { tone?: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return <Badge className={cn('rounded-full border-0', TONE[tone], className)}>{children}</Badge>
}
