'use client'

import { useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { NativeSelect } from '@/components/ui/native-select'
import { REVIEW_QUEUE_ACTIONS, type ReviewQueueLocation } from '../_lib/review-queue'

const subscribe = () => () => {}

export function QueueActionFilter({ q, action, view }: Pick<ReviewQueueLocation, 'q' | 'action' | 'view'>) {
  const router = useRouter()
  const [value, setValue] = useState<string>(action ?? '')
  const ready = useSyncExternalStore(subscribe, () => true, () => false)
  return (
    <label className="flex w-full min-w-0 items-center gap-3 text-sm sm:w-auto">
      <span className="shrink-0">Next action</span>
      <NativeSelect className="min-w-0 sm:w-48" value={value} disabled={!ready} onChange={(event) => {
        const next = event.target.value
        setValue(next)
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (next) params.set('action', next)
        if (view === 'kanban') params.set('view', view)
        router.push(params.size ? '/admin/grants?' + params.toString() : '/admin/grants')
      }}>
        <option value="">All actions</option>
        {REVIEW_QUEUE_ACTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </NativeSelect>
    </label>
  )
}
