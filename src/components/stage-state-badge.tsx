import { Badge } from '@/components/ui/badge'

const STATE = {
  upcoming: { label: 'Upcoming', className: 'bg-surface-hover text-fg-muted' },
  open: { label: 'Open for submissions', className: 'bg-success/15 text-success' },
  judging: { label: 'Judging', className: 'bg-info/15 text-info' },
  closed: { label: 'Closed', className: 'bg-surface-hover text-fg-faint' },
} as const

export function StageStateBadge({ state }: { state: keyof typeof STATE }) {
  const s = STATE[state]
  return <Badge className={`rounded-full border-0 ${s.className}`}>{s.label}</Badge>
}
