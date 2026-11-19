import { pageParam, textParam } from '@/lib/params'

export const EARN_PAGE_SIZE = 12

export function earnCatalogFilters(input: Record<string, string | string[] | undefined>) {
  const status = textParam(input.status)
  const type = textParam(input.type)
  return {
    q: textParam(input.q, 120) ?? '',
    status: status === 'closed' || status === 'announced' || status === 'all' ? status : 'open',
    type: type === 'feature' || type === 'standard' ? type : 'all',
    page: pageParam(input.page),
  } as const
}

export function escapeSearchTerm(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function publicationError(publishedAt: Date | null, deadline: Date, publish: boolean, now = new Date()) {
  if (Boolean(publishedAt) === publish) return publish ? 'This bounty is already public.' : 'This bounty is already a draft.'
  if (publish && deadline <= now) return 'Choose a future deadline before publishing.'
  return null
}
