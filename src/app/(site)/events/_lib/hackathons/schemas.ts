import { z } from 'zod'
import { parseInviteTarget } from '@/lib/project-team'
import { isValidScoreScale } from './judging'
import { buildAnswersSchema, FIELD_TYPES, type FieldDef } from './rules'

// Shared by organizer forms and their authoritative server actions.
const id = z.string().min(1, 'Reload this page and try again')
const optText = (max: number, label = 'Text') => z.string().trim().max(max, `${label}: max ${max.toLocaleString('en-US')} characters`).optional().transform((v) => v || null)
const date = z.iso.datetime({ offset: true, error: 'Pick a date and time' }).transform((v) => new Date(v))

export const stageSchema = z
  .object({
    hackathonId: id,
    stageId: id.optional(),
    name: z.string().trim().min(1, 'Name the stage').max(60, 'Name: max 60 characters'),
    descriptionMd: optText(10_000, 'What teams submit'),
    opensAt: date,
    closesAt: date,
    reviewMode: z.enum(['all', 'random']),
    judgesPerSubmission: z.union([z.coerce.number({ error: 'Enter 1 to 20 judges' }).int('Enter a whole number').min(1, 'Enter 1 to 20 judges').max(20, 'Enter 1 to 20 judges'), z.literal(''), z.null()], { error: 'Enter 1 to 20 judges' }).optional().transform((v) => (v === '' || v == null ? null : v)),
    scaleMin: z.coerce.number({ error: 'Choose 0 or 1' }).int('Choose 0 or 1').min(0, 'Choose 0 or 1').max(1, 'Choose 0 or 1').default(0),
    scaleMax: z.coerce.number({ error: 'Enter a score maximum from 1 to 100' }).int('Enter a whole number').min(1, 'Enter a score maximum from 1 to 100').max(100, 'Enter a score maximum from 1 to 100'),
    showCriteria: z.boolean(),
    advancedOnly: z.boolean(),
    sameTrackOnly: z.boolean(),
  })
  .refine((s) => s.opensAt < s.closesAt, { message: 'Submissions must open before they close', path: ['closesAt'] })
  .refine(isValidScoreScale, { message: 'Score maximum must be greater than the minimum', path: ['scaleMax'] })
  .refine((s) => s.reviewMode !== 'random' || s.judgesPerSubmission, { message: 'Set how many judges review each submission', path: ['judgesPerSubmission'] })


export const fieldSchema = z
  .object({
    hackathonId: id,
    fieldId: id.optional(),
    stageId: z.string().optional().transform((v) => v || null),
    label: z.string().trim().min(1, 'Write the question').max(200, 'Question: max 200 characters'),
    help: optText(500),
    type: z.enum(FIELD_TYPES),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1, 'Write each option').max(80, 'Option: max 80 characters')).max(30, 'At most 30 options').transform((o) => [...new Set(o)]),
    maxLength: z.union([z.coerce.number({ error: 'Enter a character limit from 1 to 20,000' }).int('Enter a whole number').min(1, 'Enter at least 1').max(20_000, 'At most 20,000 characters'), z.literal(''), z.null()], { error: 'Enter a character limit from 1 to 20,000' }).optional().transform((v) => (v === '' || v == null ? null : v)),
  })
  .refine((f) => !['select', 'multi_select'].includes(f.type) || f.options.length >= 2, { message: 'Add at least two options', path: ['options'] })

export const sponsorPrizeSchema = z.object({ hackathonId: id, sponsorPrizeId: id.optional(), sponsor: z.string().trim().min(1, 'Name the sponsor').max(80, 'Max 80 characters'), name: z.string().trim().min(1, 'Name the prize').max(80, 'Max 80 characters'), description: optText(2000), eligibilityHint: optText(500) })

export const teamCorrectionSchema = z.object({
  hackathonId: z.string().min(1),
  entryId: z.string().min(1),
  addTarget: z.string().trim().max(320, 'Enter an email or @Telegram handle').optional().transform((v) => v || null).refine((v) => !v || !!parseInviteTarget(v), 'Enter an email or @Telegram handle'),
  removeUserId: z.string().optional().transform((v) => v || null),
  reason: z.string().trim().min(1, 'Explain the correction').max(500, 'Reason: max 500 characters'),
}).refine((v) => v.addTarget || v.removeUserId, { message: 'Add or remove a member', path: ['addTarget'] })

export const builtWorkSchema = z.object({
  preexistingIdea: z.boolean(),
  builtDuringEvent: z.string().trim().max(5000, 'Built work: max 5,000 characters').optional().transform((v) => v || null),
}).refine((v) => !v.preexistingIdea || v.builtDuringEvent, { message: 'Explain what you built during the hackathon', path: ['builtDuringEvent'] })

export function submissionDetailsSchema(fields: FieldDef[]) {
  return z.intersection(builtWorkSchema, z.object({ answers: buildAnswersSchema(fields) }))
}
