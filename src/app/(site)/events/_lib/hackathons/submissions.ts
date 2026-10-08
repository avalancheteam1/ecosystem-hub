import { stageState, type Check } from './rules'

// Pure: may this team submit (or update its entry) to this stage right now?

type SubmitCtx = {
  stage: { opensAt: Date; closesAt: Date; judgingClosedAt: Date | null }
  isFirstStage: boolean
  /** The team's entry in the previous stage was advanced. */
  advancedFromPrevious: boolean
  /** null = no submission yet. */
  submissionStatus: string | null
  /** Current project member user ids. */
  team: string[]
  activeParticipants: ReadonlySet<string>
  teamSizeMin: number
  teamSizeMax: number
  submitterId: string
  now: Date
}

export function canSubmitToStage(c: SubmitCtx): Check {
  const state = stageState(c.stage, c.now)
  if (state === 'upcoming') return { ok: false, reason: 'This stage is not open yet' }
  if (state !== 'open') return { ok: false, reason: 'Submissions for this stage are closed' }
  if (!c.team.includes(c.submitterId)) return { ok: false, reason: 'Only members of the project team can submit it' }
  if (c.submissionStatus === 'withdrawn') return { ok: false, reason: 'This submission was withdrawn' }
  if (c.submissionStatus === 'disqualified') return { ok: false, reason: 'This submission was disqualified' }
  if (!c.isFirstStage && !c.advancedFromPrevious) return { ok: false, reason: 'Only teams advanced from the previous stage can submit here' }
  if (c.team.length < c.teamSizeMin) return { ok: false, reason: `Teams need at least ${c.teamSizeMin} members — invite teammates on the project` }
  if (c.team.length > c.teamSizeMax) return { ok: false, reason: `Teams can have at most ${c.teamSizeMax} members` }
  const missing = c.team.filter((u) => !c.activeParticipants.has(u))
  if (missing.length) return { ok: false, reason: `Every team member must have joined the hackathon (${missing.length} haven’t yet)` }
  return { ok: true }
}
