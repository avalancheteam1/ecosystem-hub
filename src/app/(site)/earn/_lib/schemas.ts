import { z } from 'zod'
import { githubReference } from './github'

export const earnCategories = ['Development', 'Research', 'Design'] as const

const httpsLink = z.string().trim().max(2000).transform((value, ctx) => {
  const url = URL.parse(value)
  if (url?.protocol === 'https:' && !url.username && !url.password) return url.href
  ctx.addIssue({ code: 'custom', message: 'Use an HTTPS link without credentials.' })
  return z.NEVER
})

const publicIssue = z.string().trim().max(500)
  .transform((value, ctx) => {
    const issue = githubReference(value, 'issues')
    if (issue) return issue.url
    ctx.addIssue({ code: 'custom', message: 'Use a public GitHub issue URL.' })
    return z.NEVER
  })

export const submissionPolicies = ['single', 'resubmit', 'multiple'] as const
export const reviewDecisions = ['needs_review', 'changes_requested', 'rejected', 'approved'] as const
const stageSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  deliverables: z.string().trim().max(6000),
  requiresPrevApproval: z.boolean(),
  requiresPullRequest: z.boolean(),
  submissionPolicy: z.enum(submissionPolicies),
  approvalLimit: z.number().int().min(1).max(1000).nullable(),
})
export type EarnStageInput = z.infer<typeof stageSchema>

export const bountyDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(6000),
  deliverables: z.string().trim().min(1).max(6000),
  participation: z.string().trim().min(1).max(4000),
  participationUrl: httpsLink.nullable(),
  category: z.enum(earnCategories),
  reward: z.string().trim().min(1).max(160),
  deadline: z.iso.datetime().transform((value) => new Date(value)),
  hubModule: z.string().trim().min(1).max(160).nullable(),
  githubIssueUrl: publicIssue.nullable(),
  stages: z.array(stageSchema).max(20).optional(),
  terms: z.string().trim().min(1).max(6000).nullable().optional(),
}).superRefine((value, ctx) => {
  const stages = value.stages ?? []
  if (stages.length && !value.terms) ctx.addIssue({ code: 'custom', path: ['terms'], message: 'Add terms contributors can accept.' })
  if (stages.length > 1 && stages.some((stage) => !stage.deliverables)) ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Describe the deliverables for each stage.' })
  if (stages.length && stages.filter((stage) => stage.requiresPullRequest).length !== Number(!!value.hubModule)) {
    ctx.addIssue({ code: 'custom', path: ['stages'], message: value.hubModule ? 'Choose one stage for GitHub pull requests.' : 'A pull request stage requires a Hub feature bounty.' })
  }
  if (Boolean(value.hubModule) !== Boolean(value.githubIssueUrl)) {
    ctx.addIssue({ code: 'custom', path: ['githubIssueUrl'], message: 'Specify both a Hub module and a public GitHub issue for feature bounties.' })
  }
})

export const bountyIdSchema = z.uuid()
export const bountyRevisionSchema = z.strictObject({ id: bountyIdSchema, revision: z.number().int().min(1).max(2147483646) })

export const requiredNote = z.string().trim().min(1, 'Add a reason.').max(6000)
export const revisionEvidenceSchema = z.strictObject({
  notes: z.string().trim().max(6000),
  links: z.array(httpsLink).max(10),
  pullRequests: z.array(z.string().trim().max(500).transform((value, ctx) => {
    const pr = githubReference(value, 'pull')
    if (pr) return pr.url
    ctx.addIssue({ code: 'custom', message: 'Enter a GitHub pull request URL.' })
    return z.NEVER
  })).max(10),
  accepted: z.literal(true, { error: 'Accept the bounty terms.' }),
  termsVersion: z.number().int().min(1).max(2147483646),
}).superRefine((evidence, ctx) => {
  if (!(evidence.notes || evidence.links.length || evidence.pullRequests.length)) {
    ctx.addIssue({ code: 'custom', path: ['notes'], message: 'Add a description or a work link.' })
  }
  if (new Set(evidence.links).size !== evidence.links.length || new Set(evidence.pullRequests).size !== evidence.pullRequests.length) {
    ctx.addIssue({ code: 'custom', path: ['links'], message: 'Remove duplicate links.' })
  }
})

export const submissionRefSchema = z.strictObject({
  bountyId: bountyIdSchema,
  id: bountyIdSchema,
  version: z.number().int().min(1).max(2147483646),
})

export const reviewSchema = submissionRefSchema.extend({
  decision: z.enum(reviewDecisions),
  feedback: z.string().trim().max(6000),
  internalNote: z.string().trim().max(6000),
}).superRefine(({ decision, feedback }, ctx) => {
  if ((decision === 'rejected' || decision === 'changes_requested') && !feedback) {
    ctx.addIssue({ code: 'custom', path: ['feedback'], message: 'Explain the decision to the contributor.' })
  }
})
