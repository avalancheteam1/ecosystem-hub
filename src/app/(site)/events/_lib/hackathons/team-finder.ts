import type { Check } from './rules'

// Pure find-a-team rules (no DB): who may invite whom, and the list filters. Tested in tests/team-finder.test.ts.

export const SEEKER_NOTE_MAX = 280

/** Find-a-team invites per inviter per hour - the action is a public endpoint and mails the invitee. */
export const TEAM_INVITES_PER_HOUR = 10

type InviteCtx = {
  /** Inviter's role on the project (null = not on it). */
  inviterRole: string | null
  inviterActive: boolean
  projectArchived: boolean
  inviteeId: string
  inviterId: string
  inviteeActive: boolean
  inviteeLooking: boolean
  inviteeOnProject: boolean
  openInviteExists: boolean
}

/** May the inviter invite this participant to their project from the find-a-team list? */
export function canInviteSeeker(c: InviteCtx): Check {
  if (c.inviterRole !== 'owner') return { ok: false, reason: 'Only the project owner can invite teammates' }
  if (c.projectArchived) return { ok: false, reason: 'Project not found' }
  if (!c.inviterActive) return { ok: false, reason: 'Join the hackathon to invite teammates' }
  if (c.inviteeId === c.inviterId) return { ok: false, reason: 'You can’t invite yourself' }
  if (!c.inviteeActive || !c.inviteeLooking) return { ok: false, reason: 'This builder isn’t looking for a team any more' }
  if (c.inviteeOnProject) return { ok: false, reason: 'Already on this team' }
  if (c.openInviteExists) return { ok: false, reason: 'Already invited to this project' }
  return { ok: true }
}

export type SeekerFilter = { role?: string; skill?: string; track?: string }

/** List filters (all optional, combined with AND). A seeker with no tracks picked is open to any track. */
export function matchesSeeker(s: { builderRoles: string[]; skills: string[]; trackIds: string[] }, f: SeekerFilter): boolean {
  if (f.role && !s.builderRoles.includes(f.role)) return false
  if (f.skill && !s.skills.some((k) => k.toLowerCase() === f.skill!.toLowerCase())) return false
  if (f.track && s.trackIds.length > 0 && !s.trackIds.includes(f.track)) return false
  return true
}
