import { z } from 'zod'
import { githubReference } from './github'

export const earnCategories = ['Development', 'Research', 'Design'] as const

const publicLink = z.string().trim().max(2000).transform((value, ctx) => {
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

export const bountyDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(6000),
  deliverables: z.string().trim().min(1).max(6000),
  participation: z.string().trim().min(1).max(4000),
  participationUrl: publicLink.nullable(),
  category: z.enum(earnCategories),
  reward: z.string().trim().min(1).max(160),
  deadline: z.iso.datetime().transform((value) => new Date(value)),
  hubModule: z.string().trim().min(1).max(160).nullable(),
  githubIssueUrl: publicIssue.nullable(),
}).superRefine((value, ctx) => {
  if (Boolean(value.hubModule) !== Boolean(value.githubIssueUrl)) {
    ctx.addIssue({ code: 'custom', path: ['githubIssueUrl'], message: 'Specify both a Hub module and a public GitHub issue for feature bounties.' })
  }
})

export const bountyIdSchema = z.uuid()
export const bountyRevisionSchema = z.strictObject({ id: bountyIdSchema, revision: z.number().int().min(1).max(2147483646) })
