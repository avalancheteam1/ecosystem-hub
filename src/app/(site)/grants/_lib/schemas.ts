import { z } from 'zod'

export const id = z.string().min(1).max(100)
export const text = z.string().trim().min(1).max(10000)
export const day = z.iso.date()
export const evidence = z
  .string()
  .url()
  .max(2000)
  .refine((s) => ['https:', 'http:'].includes(new URL(s).protocol), 'Use an HTTP or HTTPS evidence link')
export const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Use USD with at most two decimal places')
  .transform((s) => {
    const [whole, fraction = ''] = s.split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  })
  .pipe(z.number().int().min(100).max(1000000))

export const criterionIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'] as const
export const clearanceIds = ['eligibility', 'rights', 'conflicts', 'security', 'funding', 'continuity'] as const
export const criterion = z.object({
  score: z.enum(['ND', '0', '1', '2', '3']),
  basis: z.enum(['E', 'S']),
  source: z.string().max(2000),
  rationale: z.string().max(10000),
})
export const assessment = z.object({
  criteria: z.record(z.enum(criterionIds), criterion),
  clearances: z.record(
    z.enum(clearanceIds),
    z.object({ state: z.enum(['unresolved', 'pass', 'not_applicable']), evidence: z.string().max(2000) }),
  ),
  note: z.string().max(10000),
})
export const terms = z.object({
  title: text,
  acceptance: text,
  amountMinor: z.number().int().min(100).max(1000000),
  due: day,
  maintainer: text,
  verifier: text,
  route: z.enum(['bounded_pilot', 'established_impact']),
  hypothesis: z.string().max(10000),
  limits: z.string().max(10000),
})
export const draftTerms = terms.extend({
  title: z.string().max(10000),
  acceptance: z.string().max(10000),
  amountMinor: z.number().int().min(0).max(1000000),
  due: z.union([day, z.literal('')]),
  maintainer: z.string().max(10000),
  verifier: z.string().max(10000),
})
export const draftAnswers = z.object({
  problem: z.string().max(10000),
  outcome: z.string().max(10000),
  capability: z.string().max(10000),
  funding: z.string().max(10000),
  maintenance: z.string().max(10000),
  risks: z.string().max(10000),
  terms: draftTerms,
  costs: z.array(z.object({ title: z.string().max(10000), amountMinor: z.number().int().min(0).max(1000000) })).max(30),
})
export const answers = draftAnswers.superRefine((a, ctx) => {
  for (const key of ['problem', 'outcome', 'capability', 'funding', 'maintenance', 'risks'] as const)
    if (!a[key].trim()) ctx.addIssue({ code: 'custom', path: [key], message: 'Complete this answer' })
  if (!a.terms.title.trim() || !a.terms.acceptance.trim() || !a.terms.due || a.terms.amountMinor < 100)
    ctx.addIssue({ code: 'custom', path: ['terms'], message: 'Complete the milestone, acceptance test, target date and amount' })
  if (
    !a.costs.length ||
    a.costs.some((c) => !c.title.trim() || c.amountMinor <= 0) ||
    a.costs.reduce((n, c) => n + c.amountMinor, 0) !== a.terms.amountMinor
  )
    ctx.addIssue({ code: 'custom', path: ['costs'], message: 'Positive itemised costs must match the amount requested' })
})
const meta = z.object({ id, at: z.iso.datetime(), actorId: id })
const payment = meta.extend({
  reference: text,
  amountMinor: z.number().int().positive(),
  date: day,
  evidence,
  state: z.enum(['reported', 'confirmed', 'uncertain', 'failed', 'reversed', 'disputed']),
  note: text,
})
const submission = meta.extend({
  termsVersion: z.number().int().positive(),
  release: evidence,
  reproduction: evidence,
  note: text,
  state: z.enum(['submitted', 'changes_requested', 'accepted']),
  review: z.object({ note: text, evidence: text, verifierId: id, at: z.iso.datetime() }).nullable(),
})
const metric = z.object({
  id,
  name: text,
  unit: text,
  baseline: z.number().finite().nonnegative(),
  target: z.number().finite().nonnegative(),
  method: text,
})
const impact = meta.extend({
  day: z.enum(['30', '90', '180']),
  observations: z
    .array(
      z.object({
        metricId: id,
        value: z.number().finite().nonnegative().nullable(),
        evidence: z.string().max(2000),
        method: z.string().max(10000),
      }),
    )
    .max(20),
  narrative: text,
  state: z.enum(['draft', 'submitted', 'clarification', 'reviewed']),
  review: z.string().max(10000),
})
export const reviewStatus = z.enum(['in_review', 'shortlisted', 'approval_pending'])
const legacyState = z.object({
  version: z.literal(1),
  status: z.enum(['draft', 'submitted', 'approved', 'deferred', 'not_selected']),
  answers: draftAnswers,
  assessment,
  assessmentVersionId: id.nullable().default(null),
  applications: z.array(meta.extend({ answers, projectVersionId: id })),
  requests: z.array(meta.extend({ title: text, body: text, reply: z.string().max(10000), answeredAt: z.iso.datetime().nullable() })),
  decisions: z.array(
    meta.extend({
      outcome: z.enum(['approved', 'deferred', 'not_selected']),
      terms: terms.nullable(),
      rationale: text,
      publicNote: text,
      ownerId: id,
      budget: z.string().max(2000),
      authority: text,
    }),
  ),
  terms: z.array(
    meta.extend({ number: z.number().int().positive(), terms, confirmedAt: z.iso.datetime().nullable(), confirmedById: id.nullable() }),
  ),
  deliveries: z.array(submission),
  payments: z.array(payment),
  amendments: z.array(
    meta.extend({
      baseVersion: z.number().int().positive(),
      terms,
      reason: text,
      state: z.enum(['submitted', 'changes_requested', 'approved', 'confirmed', 'declined', 'withdrawn']),
      renewed: z.boolean().default(false),
      review: z.string().max(10000),
      authority: z.string().max(2000),
    }),
  ),
  followups: z.array(
    meta.extend({
      title: text,
      ownerId: id,
      due: day,
      waitingOn: text,
      state: z.enum(['open', 'completed']),
      note: text,
      reminderDraft: z.string().max(10000),
    }),
  ),
  impactPlan: z.object({ metrics: z.array(metric).min(1).max(20), ownerId: id }).nullable(),
  impact: z.array(impact),
  closedAt: z.iso.datetime().nullable(),
  events: z.array(meta.extend({ kind: text, note: text })),
})
const currentState = legacyState.extend({
  version: z.literal(2),
  status: z.enum([...legacyState.shape.status.options, 'withdrawn']),
  requests: z.array(legacyState.shape.requests.element.extend({ due: day.optional() })),
  statusReleases: z.array(meta.extend({ status: reviewStatus, applicationRevisionId: id })),
})
// Upgrade the live aggregate on its next write. Historical v1 receipts remain readable.
export const stateSchema = z.union([
  currentState,
  legacyState.transform((state) => currentState.parse({ ...state, version: 2, statusReleases: [] })),
])
export type GrantState = z.infer<typeof stateSchema>
export type Answers = z.infer<typeof answers>
export type Assessment = z.infer<typeof assessment>
export type Terms = z.infer<typeof terms>
export const createSchema = z
  .object({ projectId: id, roundId: id, answers: draftAnswers, submit: z.boolean().default(false), confirm: z.boolean().default(false) })
  .superRefine((input, ctx) => {
    if (input.submit) {
      if (!input.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Confirm before submitting' })
      const complete = answers.safeParse(input.answers)
      if (!complete.success)
        for (const issue of complete.error.issues)
          ctx.addIssue({ code: 'custom', path: ['answers', ...issue.path], message: issue.message })
    }
  })
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save_application'), answers: draftAnswers }),
  z.object({ kind: z.literal('submit_application'), confirm: z.literal(true) }),
  z.object({ kind: z.literal('save_assessment'), assessment }),
  z.object({ kind: z.literal('release_review_status'), status: reviewStatus }),
  z.object({ kind: z.literal('reopen_application'), confirm: z.literal(true) }),
  z.object({ kind: z.literal('withdraw_application'), confirm: z.literal(true) }),
  z.object({ kind: z.literal('request_evidence'), title: text, body: text, due: z.union([day, z.literal('')]).optional() }),
  z.object({ kind: z.literal('answer_request'), requestId: id, reply: text }),
  z.object({
    kind: z.literal('record_decision'),
    outcome: z.enum(['approved', 'deferred', 'not_selected']),
    terms: terms.nullable(),
    rationale: text,
    publicNote: text,
    ownerId: id,
    budget: z.string().max(2000),
    authority: text,
  }),
  z.object({ kind: z.literal('confirm_terms'), confirm: z.literal(true) }),
  z.object({ kind: z.literal('submit_delivery'), release: evidence, reproduction: evidence, note: text }),
  z.object({
    kind: z.literal('review_delivery'),
    deliveryId: id,
    outcome: z.enum(['accepted', 'changes_requested']),
    inspected: z.boolean(),
    reproduced: z.boolean(),
    matches: z.boolean(),
    note: text,
    evidence: text,
  }),
  z.object({
    kind: z.literal('report_payment'),
    reference: text,
    amountMinor: z.number().int().positive().max(1000000),
    date: day,
    evidence,
    note: text,
  }),
  z.object({
    kind: z.literal('reconcile_payment'),
    paymentId: id,
    state: z.enum(['confirmed', 'uncertain', 'failed', 'reversed', 'disputed']),
    evidence,
    note: text,
  }),
  z.object({ kind: z.literal('submit_amendment'), terms, reason: text }),
  z.object({
    kind: z.literal('review_amendment'),
    amendmentId: id,
    state: z.enum(['approved', 'changes_requested']),
    renewed: z.boolean(),
    review: text,
    authority: text,
  }),
  z.object({ kind: z.literal('respond_amendment'), amendmentId: id, response: z.enum(['confirmed', 'declined', 'withdrawn']), note: text }),
  z.object({
    kind: z.literal('save_followup'),
    followupId: id.optional(),
    title: text,
    ownerId: id,
    due: day,
    waitingOn: text,
    note: text,
  }),
  z.object({ kind: z.literal('finish_followup'), followupId: id, reopen: z.boolean(), note: text }),
  z.object({ kind: z.literal('draft_reminder'), followupId: id, body: text }),
  z.object({ kind: z.literal('set_impact_plan'), metrics: z.array(metric).min(1).max(20), ownerId: id }),
  z.object({
    kind: z.literal('save_impact'),
    day: z.enum(['30', '90', '180']),
    observations: z
      .array(
        z.object({
          metricId: id,
          value: z.number().finite().nonnegative().nullable(),
          evidence: z.string().max(2000),
          method: z.string().max(10000),
        }),
      )
      .max(20),
    narrative: text,
    submit: z.boolean(),
  }),
  z.object({ kind: z.literal('review_impact'), impactId: id, state: z.enum(['clarification', 'reviewed']), review: text }),
  z.object({ kind: z.literal('close_impact'), note: text }),
])
export type Command = z.infer<typeof commandSchema>
export const mutationSchema = z.object({ applicationId: id, revision: z.number().int().nonnegative(), command: commandSchema })
export const roundSchema = z.object({ name: text, published: z.boolean() })

export const roundChoice = z.object({ disposition: z.enum(['call', 'await_evidence', 'feedback']), ownerId: id, rationale: text })
export const storedRoundChoice = roundChoice.extend({
  actorId: id,
  at: z.iso.datetime(),
  history: z.array(roundChoice.extend({ actorId: id, at: z.iso.datetime() })),
})
