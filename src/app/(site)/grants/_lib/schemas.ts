import { z } from 'zod'

export const roundNotAccepting = 'This round is not accepting applications'
export const continuousIntakePaused = 'Mini Grants intake is paused. You can keep editing your saved draft.'
export const missingDemo = 'Add a demo link showing your working project or prototype to your Hub project.'
export const roundClosedForSubmission = 'This round has closed. You can keep editing the draft and submit when it reopens.'

export const id = z.string().min(1).max(100)
export const startSchema = z.strictObject({ projectId: id })
const demoUrl = z.url({ protocol: /^https?$/ })
export const hasDemoProof = (demoLinks: string[]) => demoLinks.some((link) => demoUrl.safeParse(link).success)
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
export const publicAwardTerms = terms.pick({ title: true, acceptance: true, amountMinor: true, due: true, maintainer: true })

export const draftTerms = terms.extend({
  title: z.string().max(10000),
  acceptance: z.string().max(10000),
  amountMinor: z.number().int().min(0).max(1000000),
  due: z.union([day, z.literal('')]),
  maintainer: z.string().max(10000),
  verifier: z.string().max(10000),
})
export const draftAnswers = z.object({
  intakeVersion: z.never().optional(),
  projectMilestoneId: id.optional(),
  whyGrant: z.string().max(4000).optional(),
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
  if (!a.terms.title.trim() || !a.terms.due)
    ctx.addIssue({ code: 'custom', path: ['projectMilestoneId'], message: 'Choose a milestone with a title and target date.' })
  if (!a.terms.acceptance.trim())
    ctx.addIssue({ code: 'custom', path: ['terms', 'acceptance'], message: 'Explain how the reviewer can verify delivery.' })
  if (a.terms.amountMinor < 100)
    ctx.addIssue({ code: 'custom', path: ['terms', 'amountMinor'], message: 'Enter at least $1.' })
  if (
    !a.costs.length ||
    a.costs.some((c) => !c.title.trim() || c.amountMinor <= 0) ||
    a.costs.reduce((n, c) => n + c.amountMinor, 0) !== a.terms.amountMinor
  )
    ctx.addIssue({ code: 'custom', path: ['costs'], message: 'Positive itemised costs must match the amount requested' })
})
const shortMilestoneFields = {
  title: z.string().trim().max(250),
  due: z.union([day, z.literal('')]),
  evidence: z.string().trim().max(500),
}
const roadmapMilestone = z.strictObject({ source: z.literal('roadmap'), id, ...shortMilestoneFields })
const applicationMilestone = z.strictObject({ source: z.literal('application'), ...shortMilestoneFields })
const milestoneInput = z.discriminatedUnion('source', [roadmapMilestone, applicationMilestone])
export const shortDraft = z.object({
  intakeVersion: z.literal(2),
  amountMinor: z.number().int().min(100).max(1000000).multipleOf(100).nullable(),
  summary: z.string().trim().max(1000),
  milestone: milestoneInput.nullable(),
}).strict()
export const shortSubmission = shortDraft.superRefine((a, ctx) => {
  const issue = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message })
  if (a.amountMinor === null) issue(['amountMinor'], 'Enter a whole-dollar amount from $1 to $10,000.')
  if (!a.summary) issue(['summary'], 'Summarize the work this grant will fund.')
  if (!a.milestone) {
    issue(['milestone'], 'Choose or add a milestone.')
    return
  }
  if (!a.milestone.title) issue(['milestone', 'title'], 'Enter the concrete deliverable.')
  if (!a.milestone.due) issue(['milestone', 'due'], 'Set a target date.')
  if (!a.milestone.evidence) issue(['milestone', 'evidence'], 'Describe what evidence will show completion.')
})
export const MAX_PLAN_MILESTONES = 3
export const planDraft = shortDraft.omit({ milestone: true }).extend({
  intakeVersion: z.literal(3),
  milestones: z.array(milestoneInput).max(MAX_PLAN_MILESTONES, 'Choose at most three milestones.'),
}).superRefine(({ milestones }, ctx) => {
  const seen = new Set<string>()
  milestones.forEach((milestone, index) => {
    if (milestone.source !== 'roadmap') return
    if (seen.has(milestone.id))
      ctx.addIssue({ code: 'custom', path: ['milestones', index, 'id'], message: 'Choose each roadmap milestone once.' })
    seen.add(milestone.id)
  })
})
export const planSubmission = planDraft.superRefine((value, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
  if (value.amountMinor === null) issue(['amountMinor'], 'Enter a whole-dollar amount from $1 to $10,000.')
  if (!value.summary) issue(['summary'], 'Summarize the work this grant will fund.')
  if (!value.milestones.length) issue(['milestones'], 'Choose or add at least one milestone.')
  value.milestones.forEach((milestone, index) => {
    if (!milestone.title) issue(['milestones', index, 'title'], 'Enter the concrete deliverable.')
    if (!milestone.due) issue(['milestones', index, 'due'], 'Set a target date.')
    if (!milestone.evidence) issue(['milestones', index, 'evidence'], 'Describe what evidence will show completion.')
  })
})
const legacyIntake = z.union([shortDraft, draftAnswers])
export const intakeAnswers = z.union([planDraft, legacyIntake])
export type ShortIntake = z.infer<typeof shortDraft>
export type PlanIntake = z.infer<typeof planDraft>
export type IntakeAnswers = z.infer<typeof intakeAnswers>

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
const decision = meta.extend({
  outcome: z.enum(['approved', 'deferred', 'not_selected']),
  terms: terms.nullable(),
  rationale: text,
  publicNote: text,
  ownerId: id,
  budget: z.string().max(2000),
  authority: text,
})
const committeeDecision = decision.omit({ budget: true, authority: true }).extend({ terms: z.null() })
const legacyState = z.object({
  version: z.literal(1),
  status: z.enum(['draft', 'submitted', 'approved', 'deferred', 'not_selected']),
  answers: draftAnswers,
  assessment,
  assessmentVersionId: id.nullable().default(null),
  applications: z.array(meta.extend({ answers, projectVersionId: id })),
  requests: z.array(meta.extend({ title: text, body: text, reply: z.string().max(10000), answeredAt: z.iso.datetime().nullable() })),
  decisions: z.array(decision),
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
  answers: legacyIntake,
  applications: z.array(meta.extend({ answers: z.union([shortSubmission, answers]), projectVersionId: id })),
  status: z.enum([...legacyState.shape.status.options, 'withdrawn']),
  requests: z.array(legacyState.shape.requests.element.extend({ due: day.optional() })),
  statusReleases: z.array(meta.extend({ status: reviewStatus, applicationRevisionId: id })),
})
const milestoneFirstState = currentState.extend({
  version: z.literal(3),
  answers: shortSubmission,
  milestoneClearance: meta.extend({ applicationRevisionId: id, projectVersionId: id }).nullable(),
  deliveries: z.array(submission.extend({ termsVersion: z.null() })),
})
const multiMilestoneState = currentState.extend({
  version: z.literal(4),
  answers: planDraft,
  decisions: z.array(z.union([
    decision,
    committeeDecision.extend({ outcome: z.literal('deferred'), nextStep: text }),
    committeeDecision.extend({ outcome: z.literal('not_selected') }),
  ])),
  applications: z.array(meta.extend({
    answers: shortDraft.omit({ milestone: true }).extend({
      intakeVersion: z.literal(3),
      milestones: z.array(z.discriminatedUnion('source', [
        roadmapMilestone.extend({ milestoneId: id }),
        applicationMilestone.extend({ milestoneId: id }),
      ])).min(1).max(MAX_PLAN_MILESTONES),
    }),
    projectVersionId: id,
  })).max(1),
  planApproval: meta.extend({ planId: id, projectVersionId: id }).nullable(),
  deliveries: z.array(submission.extend({ termsVersion: z.null(), planId: id, milestoneId: id })),
})
// Upgrade the live aggregate on its next write. Historical v1 receipts remain readable.
export const stateSchema = z.union([
  multiMilestoneState,
  milestoneFirstState,
  currentState,
  legacyState.transform((state) => currentState.parse({ ...state, version: 2, statusReleases: [] })),
])
export type GrantState = z.infer<typeof stateSchema>
export type Answers = z.infer<typeof answers>
export type Assessment = z.infer<typeof assessment>
export type Terms = z.infer<typeof terms>
export const createSchema = z
  .object({ projectId: id, roundId: id, answers: legacyIntake, submit: z.boolean().default(false), confirm: z.boolean().default(false) })
  .superRefine((input, ctx) => {
    if (input.submit) {
      if (!input.confirm) ctx.addIssue({ code: 'custom', path: ['confirm'], message: 'Confirm before submitting' })
      if (input.answers.intakeVersion !== 2 && !input.answers.whyGrant?.trim())
        ctx.addIssue({ code: 'custom', path: ['answers', 'whyGrant'], message: 'Explain why this grant would make a difference.' })
      const complete = input.answers.intakeVersion === 2 ? shortSubmission.safeParse(input.answers) : answers.safeParse(input.answers)
      if (!complete.success)
        for (const issue of complete.error.issues)
          ctx.addIssue({ code: 'custom', path: ['answers', ...issue.path], message: issue.message })
    }
  })
export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save_application'), answers: intakeAnswers }),
  z.object({ kind: z.literal('submit_application'), confirm: z.literal(true), shortAnswers: shortSubmission.optional(), planAnswers: planSubmission.optional() }),
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
  z.strictObject({ kind: z.literal('hold_application'), rationale: text, publicNote: text, nextStep: text }),
  z.strictObject({ kind: z.literal('decline_application'), rationale: text, publicNote: text }),
  z.strictObject({ kind: z.literal('issue_award'), rationale: text, publicNote: text }),
  z.object({ kind: z.literal('clear_milestone'), confirm: z.literal(true), planId: id.optional() }),
  z.object({ kind: z.literal('confirm_terms'), confirm: z.literal(true) }),
  z.object({
    kind: z.literal('submit_delivery'), release: evidence, reproduction: evidence, note: text,
    planId: id.optional(), milestoneId: id.optional(), previousAttemptId: id.nullable().optional(),
  }),
  z.object({
    kind: z.literal('review_delivery'),
    deliveryId: id,
    planId: id.optional(),
    milestoneId: id.optional(),
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
  z.object({ kind: z.literal('submit_amendment'), terms: z.union([terms, publicAwardTerms.strict()]), reason: text }),
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
