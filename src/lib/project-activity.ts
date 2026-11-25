import type { Prisma } from '@prisma/client'

// Project activity (`ProjectActivity`, prisma/schema/projects.prisma): what happened to a project in a program - submitted to a
// hackathon, approved on Developer Tooling, later grants. The team sees it per version on the project page, reviewers on their
// pages. APPEND-ONLY. Every action that changes a submission writes its rows with `recordProjectActivity` INSIDE the
// transaction of that change, so state and history never drift apart. What is live or submitted stays in the program's tables.

/** Programs a project takes part in. Keys are persisted - only add. `staff`: who acts on the other side, shown to the team instead of a name. */
export const PROJECT_PROGRAMS = {
  hackathon: { label: 'Hackathon', staff: 'the organisers' },
  grants: { label: 'Mini Grants', staff: 'the grants team' },
  tooling: { label: 'Developer Tooling', staff: 'team1' },
} as const
export type ProjectProgram = keyof typeof PROJECT_PROGRAMS

/** What can happen. Keys are persisted - only add. */
export const PROJECT_ACTIVITY_EVENTS = {
  submitted: 'Submitted',
  approved: 'Approved and live',
  replaced: 'Replaced by a newer version',
  rejected: 'Not approved',
  removed: 'Taken off the list',
  withdrawn: 'Withdrawn',
  unlisted: 'Unlisted',
  advanced: 'Advanced to the next stage',
  unadvanced: 'Advance taken back',
  disqualified: 'Disqualified',
  reinstated: 'Reinstated',
  grant_plan_approved: 'Milestone plan approved',
  grant_evidence_submitted: 'Milestone evidence submitted',
  grant_milestone_verified: 'Milestone verified',
  grant_evidence_returned: 'Milestone evidence returned',
} as const
export type ProjectActivityEvent = keyof typeof PROJECT_ACTIVITY_EVENTS

/** Done by the team itself (their name is shown); `replaced` follows from another event (no one shown); the rest is the program's staff. */
const TEAM_EVENTS: ReadonlySet<string> = new Set<ProjectActivityEvent>(['submitted', 'withdrawn', 'unlisted', 'grant_evidence_submitted'])
const NO_ACTOR: ReadonlySet<string> = new Set<ProjectActivityEvent>(['replaced'])

export type ProjectActivityInput = {
  projectId: string
  versionId: string | null
  program: ProjectProgram
  /** The program's object the link opens: hackathon id, tooling listing id. */
  targetId: string
  /** What it is called now, e.g. "ETH Denver · Final"; kept as it was. */
  targetName: string
  event: ProjectActivityEvent
  reason?: string | null
  reasonInternal?: boolean
  actorId: string | null
}

/** Write activity rows. Pass the transaction of the change (`tx`), never the global client. */
export async function recordProjectActivity(tx: Prisma.TransactionClient, rows: ProjectActivityInput[]): Promise<void> {
  if (rows.length) await tx.projectActivity.createMany({ data: rows })
}

/** `targetName` of a hackathon: the event, plus the stage when there are several. */
export const hackathonTargetName = (eventName: string, stageName: string, stageCount: number) => (stageCount > 1 ? `${eventName} · ${stageName}` : eventName)

const label = <T extends Record<string, unknown>>(map: T, key: string): T[keyof T] | undefined => (Object.hasOwn(map, key) ? map[key as keyof T] : undefined)

/**
 * One entry as the team sees it: the event's label, who did it (a team member's name, or the program's staff - reviewers and
 * organisers stay anonymous) and the reason, unless it is internal.
 */
export function teamActivityView(a: { program: string; event: string; actorId: string | null; reason: string | null; reasonInternal: boolean }, names: ReadonlyMap<string, string>) {
  const program = label(PROJECT_PROGRAMS, a.program)
  const byTeam = TEAM_EVENTS.has(a.event)
  return {
    event: label(PROJECT_ACTIVITY_EVENTS, a.event) ?? a.event,
    program: program?.label ?? a.program,
    by: NO_ACTOR.has(a.event) ? null : byTeam ? (a.actorId ? names.get(a.actorId) ?? 'a former member' : null) : program?.staff ?? null,
    reason: a.reasonInternal ? null : a.reason,
  }
}

/** The event's label for reviewers (who see every name and reason themselves). */
export const activityLabel = (event: string) => label(PROJECT_ACTIVITY_EVENTS, event) ?? event
