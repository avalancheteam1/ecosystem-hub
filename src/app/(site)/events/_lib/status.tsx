import { Badge } from '@/components/ui/badge'

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-surface-hover text-fg-muted' },
  published: { label: 'Published', className: 'bg-success/15 text-success' },
  archived: { label: 'Archived', className: 'bg-surface-hover text-fg-faint' },
}

export function EventStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft!
  return <Badge className={`rounded-full border-0 ${s.className}`}>{s.label}</Badge>
}
