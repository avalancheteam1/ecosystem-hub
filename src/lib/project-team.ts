import { z } from 'zod'
import type { Prisma } from '@prisma/client'

/** Match project join order, breaking equal timestamps by unique membership ID. */
export const PROJECT_MEMBER_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.ProjectMemberOrderByWithRelationInput[]

export const ASSIGNABLE_ROLES = ['writer', 'reader'] as const
export const canManageTeam = (role: string) => role === 'owner'

export function parseInviteTarget(value: string): { email: string } | { handle: string } | null {
  const v = value.trim().toLowerCase()
  if (z.email().safeParse(v).success) return { email: v }
  if (/^@[a-z][a-z0-9_]{4,31}$/.test(v)) return { handle: v.slice(1) }
  return null
}

export function inviteTargetError(value: string): string | null {
  return value.trim().length <= 320 && parseInviteTarget(value) ? null : 'Enter an email or @Telegram handle'
}

export function teamMemberStatus(joined: boolean, registration: string | null): string {
  const team = joined ? 'Joined team' : 'Invited to team'
  if (registration === 'active') return joined ? `${team}, registered for this hackathon` : 'Registered for this hackathon, invited to team'
  return `${team}, ${registration === 'pending' ? 'registration awaiting approval' : 'not registered for this hackathon'}`
}

export function teamWarnings(members: { name: string; registered: boolean }[], pendingInvites: number): string[] {
  const warnings: string[] = []
  if (pendingInvites) warnings.push(`${pendingInvites} pending team invitation${pendingInvites === 1 ? '' : 's'}. Invited people are not included in the submission.`)
  const unregistered = members.filter((m) => !m.registered)
  if (unregistered.length) warnings.push(`Not registered for this hackathon: ${unregistered.map((m) => m.name).join(', ')}.`)
  return warnings
}


/** UI visibility only; the invitation action independently checks ownership. */
export function canInviteTeammates(members: { userId: string; role: string }[], userId: string): boolean {
  return members.some((m) => m.userId === userId && canManageTeam(m.role))
}
