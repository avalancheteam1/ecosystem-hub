import 'server-only'
import type { OverviewSource } from '@/app/admin/_lib/overview'
import { can } from '@/lib/permissions'
import { REVIEW_QUEUE_ACTIONS } from './review-queue'
import { countReviewQueueActions } from './review-queue-queries'

export const grantsOverview: OverviewSource = {
  group: 'Grants',
  show: (user) => can(user, 'grants.review'),
  load: async () => {
    const counts = new Map((await countReviewQueueActions()).map(({ action, count }) => [action, count]))
    return {
      todos: REVIEW_QUEUE_ACTIONS.flatMap(([action, label]) => {
        const count = counts.get(action)
        return count ? [{ label, count, href: '/admin/grants?action=' + action }] : []
      }),
    }
  },
}
