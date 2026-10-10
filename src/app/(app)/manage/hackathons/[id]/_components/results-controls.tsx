'use client'

import { setAward, setResultsPublished } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'

/** One winner slot; a range prize renders one per place, labelled with the place. */
export function AwardSelect({ hackathonId, prizeId, placement, label, value, options }: { hackathonId: string; prizeId: string; placement: number; label?: string; value: string | null; options: { id: string; label: string }[] }) {
  const { pending, run } = useActionToast()
  const select = (
    <NativeSelect
      aria-label={label ? `Winner, ${label}` : 'Winner'}
      disabled={pending}
      value={value ?? ''}
      onChange={(e) => run(() => setAward({ hackathonId, prizeId, placement, submissionId: e.target.value }), e.target.value ? 'Winner set' : 'Winner cleared')}
      className="min-w-0 flex-1"
    >
      <option value="">No winner yet</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </NativeSelect>
  )
  if (!label) return <div className="flex">{select}</div>
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-fg-muted">{label}</span>
      {select}
    </div>
  )
}

export function PublishResultsButton({ hackathonId, published }: { hackathonId: string; published: boolean }) {
  const { pending, run } = useActionToast()
  return (
    <Button variant={published ? 'outline' : 'default'} disabled={pending} onClick={() => run(() => setResultsPublished({ hackathonId, published: !published }), published ? 'Results hidden' : 'Results are public')}>
      {published ? 'Hide results' : 'Publish results'}
    </Button>
  )
}
