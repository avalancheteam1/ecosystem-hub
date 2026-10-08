import { z } from 'zod'
import { can, type AuthzUser } from '@/lib/permissions'

// Pure hackathon rules (no DB). Server actions enforce them; pages mirror them.

export type StageState = 'upcoming' | 'open' | 'judging' | 'closed'
type StageWindow = { opensAt: Date; closesAt: Date; judgingClosedAt: Date | null }

/** closesAt is exclusive: at closesAt submissions are over and judging starts. */
export function stageState(s: StageWindow, now: Date): StageState {
  if (s.judgingClosedAt) return 'closed'
  if (now < s.opensAt) return 'upcoming'
  if (now < s.closesAt) return 'open'
  return 'judging'
}

/** Problems with a stage list, in order (empty = valid). */
export function validateStages(stages: (StageWindow & { name: string; order: number })[]): string[] {
  const errors: string[] = []
  const sorted = [...stages].sort((a, b) => a.order - b.order)
  sorted.forEach((s, i) => {
    if (s.closesAt <= s.opensAt) errors.push(`${s.name}: closes before it opens`)
    const prev = sorted[i - 1]
    if (prev && s.opensAt < prev.closesAt) errors.push(`${s.name}: overlaps ${prev.name} — a stage must open after the previous one closes`)
  })
  return errors
}

export const FIELD_TYPES = ['short_text', 'long_text', 'url', 'select', 'multi_select', 'checkbox', 'number'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export type FieldDef = { id: string; label: string; type: string; required: boolean; options: string[]; maxLength: number | null }

const DEFAULT_MAX: Record<string, number> = { short_text: 280, long_text: 5000 }
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

function fieldSchema(f: FieldDef): z.ZodType {
  const req = `${f.label} is required`
  switch (f.type) {
    case 'short_text':
    case 'long_text': {
      const max = f.maxLength ?? DEFAULT_MAX[f.type]!
      const s = z.string().trim().max(max, `${f.label}: at most ${max} characters`)
      return f.required ? s.min(1, req) : z.preprocess(blankToNull, s.nullable().optional()).transform((v) => v ?? null)
    }
    case 'url': {
      const s = z.string().trim().max(500).url(`${f.label}: enter a full link`).refine((u) => /^https?:\/\//i.test(u), `${f.label}: link must start with https://`)
      return f.required ? s : z.preprocess(blankToNull, s.nullable().optional()).transform((v) => v ?? null)
    }
    case 'select': {
      const s = z.string().refine((v) => f.options.includes(v), `${f.label}: pick one of the options`)
      return f.required ? s : z.preprocess(blankToNull, s.nullable().optional()).transform((v) => v ?? null)
    }
    case 'multi_select': {
      const s = z.array(z.string().refine((v) => f.options.includes(v), `${f.label}: unknown option`)).transform((a) => [...new Set(a)])
      return f.required ? s.refine((a) => a.length > 0, req) : s.optional().transform((v) => v ?? [])
    }
    case 'checkbox':
      return f.required ? z.literal(true, { error: req }) : z.boolean().optional().transform((v) => v ?? false)
    case 'number': {
      const s = z.coerce.number({ error: `${f.label}: enter a number` }).finite()
      return f.required ? s : z.preprocess(blankToNull, s.nullable().optional()).transform((v) => v ?? null)
    }
    default:
      return z.never()
  }
}

/** Zod schema for answers keyed by field id; unknown keys are stripped. */
export function buildAnswersSchema(fields: FieldDef[]) {
  return z.object(Object.fromEntries(fields.map((f) => [f.id, fieldSchema(f)])))
}

type JoinHackathon = { status: string; registrationOpensAt: Date | null; registrationClosesAt: Date | null; maxParticipants: number | null; termsUrl: string | null }
type JoinCtx = { now: Date; participants: number; alreadyJoined: boolean; acceptedTerms: boolean }
export type Check = { ok: true } | { ok: false; reason: string }

export function canJoin(h: JoinHackathon, c: JoinCtx): Check {
  if (h.status !== 'published') return { ok: false, reason: 'This hackathon is not open yet' }
  if (c.alreadyJoined) return { ok: false, reason: "You've already joined" }
  if (h.registrationOpensAt && c.now < h.registrationOpensAt) return { ok: false, reason: 'Registration has not opened yet' }
  if (h.registrationClosesAt && c.now >= h.registrationClosesAt) return { ok: false, reason: 'Registration is closed' }
  if (h.maxParticipants != null && c.participants >= h.maxParticipants) return { ok: false, reason: 'This hackathon is full' }
  if (h.termsUrl && !c.acceptedTerms) return { ok: false, reason: 'Accept the terms to join' }
  return { ok: true }
}

/** Organisers (bound invites) or holders of hackathons.manage. */
export function canManageHackathon(user: (AuthzUser & { id: string }) | null, organizers: { userId: string | null }[]): boolean {
  if (!user) return false
  return can(user, 'hackathons.manage') || organizers.some((o) => o.userId === user.id)
}

type ChecklistInput = {
  tagline: string
  teamSizeMin: number
  teamSizeMax: number
  eventPublished: boolean
  stages: (StageWindow & { name: string; order: number; criteria: { weight: number }[]; reviewMode: string; judgesPerSubmission: number | null })[]
}

/** Everything that must be fixed before the hackathon can be published. */
export function publishChecklist(h: ChecklistInput): string[] {
  const problems: string[] = []
  if (!h.tagline.trim()) problems.push('Add a tagline')
  if (h.teamSizeMin < 1 || h.teamSizeMin > h.teamSizeMax) problems.push('Team size: minimum must be between 1 and the maximum')
  if (!h.eventPublished) problems.push('Publish the event first')
  if (h.stages.length === 0) return [...problems, 'Add at least one stage']
  problems.push(...validateStages(h.stages))
  for (const s of h.stages) {
    if (s.criteria.length === 0) problems.push(`${s.name}: add at least one judging criterion`)
    if (s.reviewMode === 'random' && !(s.judgesPerSubmission && s.judgesPerSubmission >= 1)) problems.push(`${s.name}: set how many judges review each submission`)
  }
  return problems
}
