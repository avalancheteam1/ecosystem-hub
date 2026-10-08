'use client'

import { setAward, setResultsPublished } from '@/app/(site)/events/_lib/hackathons/judging-actions'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'

export function AwardSelect({ hackathonId, prizeId, value, options }: { hackathonId: string; prizeId: string; value: string | null; options: { id: string; label: string }[] }) {
  const { pending, run } = useActionToast()
  return (
    <NativeSelect
      aria-label="Winner"
      disabled={pending}
      value={value ?? ''}
      onChange={(e) => run(() => setAward({ hackathonId, prizeId, submissionId: e.target.value }), e.target.value ? 'Winner set' : 'Winner cleared')}
      className="max-w-sm"
    >
      <option value="">No winner yet</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </NativeSelect>
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
