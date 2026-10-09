import { stageState, type StageState } from '@/app/(site)/events/_lib/hackathons/rules'

// What the dashboard says about a hackathon the builder joined. Pure.
type Stage = { id: string; name: string; opensAt: Date; closesAt: Date; judgingClosedAt: Date | null }
export type HackathonMoment = { state: StageState | 'results'; stage: string | null; at: Date | null; submitted: boolean }

/**
 * The stage that matters now: an open one, else the next upcoming, else the one being judged.
 * null = it's over and results came out more than 30 days ago (drop it from the dashboard).
 */
export function hackathonMoment(stages: Stage[], resultsPublishedAt: Date | null, eventStartAt: Date, submittedStageIds: ReadonlySet<string>, now: Date): HackathonMoment | null {
  const pick = (st: StageState) => stages.find((s) => stageState(s, now) === st)
  const s = pick('open') ?? pick('upcoming') ?? pick('judging')
  if (s) {
    const state = stageState(s, now)
    return { state, stage: s.name, at: state === 'open' ? s.closesAt : state === 'upcoming' ? s.opensAt : null, submitted: submittedStageIds.has(s.id) }
  }
  if (resultsPublishedAt && now.getTime() - resultsPublishedAt.getTime() < 30 * 86_400_000) return { state: 'results', stage: null, at: resultsPublishedAt, submitted: submittedStageIds.size > 0 }
  // No rounds set up yet: count down to the event itself.
  if (stages.length === 0 && eventStartAt > now) return { state: 'upcoming', stage: null, at: eventStartAt, submitted: false }
  return null
}

const ORDER = { open: 0, upcoming: 1, judging: 2, results: 3, closed: 4 }
/** Open submissions first, then upcoming, judging, results — soonest date first within each. */
export const byUrgency = (a: HackathonMoment, b: HackathonMoment) => ORDER[a.state] - ORDER[b.state] || (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)

/**
 * One line that nudges the team to keep the project fresh, or null when it looks well kept.
 * `daysSinceUpdate` = days since the current version was last edited.
 */
export function projectNudge(p: { daysSinceUpdate: number; maturity: string | null; nextMilestone: { title: string; targetDate: string } | null; missing: number }): string | null {
  // TODO(you): decide what to nudge about, and in which order.
  return null
}

/** Active projects first, archived (stage) last — most recently updated first within each. */
export const byActivity = (a: { maturity: string | null; updatedAt: Date }, b: { maturity: string | null; updatedAt: Date }) =>
  Number(a.maturity === 'archived') - Number(b.maturity === 'archived') || b.updatedAt.getTime() - a.updatedAt.getTime()
