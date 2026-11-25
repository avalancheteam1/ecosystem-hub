import { pageParam, textParam } from '@/lib/params'

export const REVIEW_QUEUE_ACTIONS = [
  ['review', 'Review application'],
  ['applicant', 'Waiting for applicant'],
  ['verification', 'Verify evidence'],
  ['decision', 'Review for decision'],
  ['operations', 'Award follow-up'],
  ['inactive', 'On hold or closed'],
] as const

export type ReviewQueueAction = (typeof REVIEW_QUEUE_ACTIONS)[number][0]
export type ReviewQueueSearchParams = Partial<Record<'q' | 'action' | 'view' | 'page', string | string[]>>
export type ReviewQueueFilters = { q?: string; action?: ReviewQueueAction; page: number }
export type ReviewQueueLocation = ReviewQueueFilters & { view: 'list' | 'kanban' }

export function parseReviewQueue(params: ReviewQueueSearchParams): ReviewQueueLocation {
  const action = textParam(params.action)
  return {
    q: textParam(params.q),
    action: REVIEW_QUEUE_ACTIONS.find(([key]) => key === action)?.[0],
    view: textParam(params.view) === 'kanban' ? 'kanban' : 'list',
    page: pageParam(params.page),
  }
}
