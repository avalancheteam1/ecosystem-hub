// Pure organizer-feedback rules shared by the forms, queries and server actions.
export function selectionProblem(selected: readonly string[], available: readonly string[], label: string): string | null {
  return selected.some((id) => !available.includes(id)) ? `Unknown ${label}` : null
}

export type SubmissionFilters = { track?: string; sponsor?: string }
export function matchesSubmissionFilters(s: { trackIds: readonly string[]; sponsorPrizeIds: readonly string[] }, filters: SubmissionFilters): boolean {
  return (!filters.track || (filters.track === 'none' ? s.trackIds.length === 0 : s.trackIds.includes(filters.track))) && (!filters.sponsor || s.sponsorPrizeIds.includes(filters.sponsor))
}

export function prizeWinnerState(publishedAt: Date | null, eligibleAwards: number): 'published' | 'Winner to be announced' {
  return publishedAt && eligibleAwards > 0 ? 'published' : 'Winner to be announced'
}

export function needsResultsReminder(stages: { judgingClosedAt: Date | null }[], publishedWinners: number): boolean {
  return !!stages.at(-1)?.judgingClosedAt && publishedWinners === 0
}

export function isEligibleForPrize(s: { trackIds: readonly string[]; sponsorPrizeIds: readonly string[] }, prize: { trackId: string | null; sponsorPrizeId: string | null }): boolean {
  return (!prize.trackId || s.trackIds.includes(prize.trackId)) && (!prize.sponsorPrizeId || s.sponsorPrizeIds.includes(prize.sponsorPrizeId))
}

export function visiblePrizeAwards<T extends { submission: { trackIds: string[]; sponsorPrizeIds: string[] } }>(prize: { publishedAt: Date | null; awards: T[] }, filters: SubmissionFilters): T[] {
  return prize.publishedAt ? prize.awards.filter((a) => matchesSubmissionFilters(a.submission, filters)) : []
}
