import { z } from 'zod'
import { isCountryCode } from '@/lib/countries'

// Builder profile fields — taken from builders-hub (battle-tested), with its
// inconsistencies fixed: one bio limit (250), ISO country codes, role flags as
// one list, handles normalised to the bare username. Pure.

export const BUILDER_ROLES = [
  { id: 'university', name: 'University', description: 'Student or affiliate' },
  { id: 'founder', name: 'Founder', description: 'Building a startup' },
  { id: 'developer', name: 'Developer', description: 'Ship code on-chain' },
  { id: 'employee', name: 'Employee', description: 'Working at a web3 company' },
  { id: 'enthusiast', name: 'Enthusiast', description: 'Curious and exploring' },
] as const
export type BuilderRole = (typeof BUILDER_ROLES)[number]['id']

export const EMPLOYMENT_ROLES = ['Accounting', 'Administrative', 'Business Development', 'Communications', 'Consulting', 'Customer Service', 'Design', 'Education', 'Engineering', 'Entrepreneurship', 'Finance', 'Health Professional', 'Human Resources', 'Information Technology', 'Legal', 'Marketing', 'Operations', 'Product', 'Project Management', 'Public Relations', 'Quality Assurance', 'Real Estate', 'Recruiting', 'Research', 'Sales', 'Support', 'Retired', 'Other'] as const

export const SKILL_SUGGESTIONS = ['Solidity', 'Rust', 'TypeScript', 'Go', 'Move', 'Avalanche L1', 'Foundry', 'Hardhat', 'wagmi', 'viem', 'ZK', 'Smart contract security', 'Frontend', 'Product design']

// builders-hub lib/profile/socialAccountValidation.ts
const GITHUB = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})\/?$/i
const X = /^(?:@|https?:\/\/(?:www\.)?(?:twitter|x)\.com\/)?([A-Za-z0-9_]{1,15})\/?$/i
const LINKEDIN = /^https?:\/\/(?:www\.)?linkedin\.com\/(?:in|pub|company|school)\/[\p{L}\p{N}_\-.%]+\/?$/iu
const TELEGRAM = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v)
const handle = (re: RegExp, msg: string) =>
  z.preprocess(blank, z.string().nullable().optional()).transform((v, ctx) => {
    if (!v) return null
    const m = v.match(re)
    if (!m) {
      ctx.addIssue({ code: 'custom', message: msg })
      return z.NEVER
    }
    return m[1]!
  })
const optText = (max: number) => z.preprocess(blank, z.string().max(max).nullable().optional()).transform((v) => v ?? null)
const httpUrl = z.string().trim().url('Must be a valid link').refine((u) => /^https?:\/\//i.test(u), 'Must start with https://')
const dedupe = (items: string[]) => {
  const seen = new Set<string>()
  return items.map((s) => s.trim()).filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
}

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  username: z
    .preprocess(blank, z.string().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'Username: 3–30 letters, digits or _').nullable().optional())
    .transform((v) => v ?? null),
  bio: optText(250).refine((v) => !v || v.length <= 250, 'Bio must not exceed 250 characters'),
  country: z.preprocess(blank, z.string().refine(isCountryCode, 'Pick a country').nullable().optional()).transform((v) => v ?? null),
  builderRoles: z.array(z.enum(BUILDER_ROLES.map((r) => r.id) as [BuilderRole, ...BuilderRole[]])).transform((r) => [...new Set(r)]),
  institution: optText(120),
  companyName: optText(120),
  employeeRole: z.preprocess(blank, z.enum(EMPLOYMENT_ROLES).nullable().optional()).transform((v) => v ?? null),
  githubAccount: handle(GITHUB, 'Enter a valid GitHub username or github.com link'),
  xAccount: handle(X, 'Enter an X handle or a link like https://x.com/yourhandle'),
  linkedinAccount: z.preprocess(blank, z.string().regex(LINKEDIN, 'Enter a LinkedIn link like https://www.linkedin.com/in/username').nullable().optional()).transform((v) => v ?? null),
  telegramAccount: handle(TELEGRAM, 'Enter a valid Telegram username (5–32 chars, starts with a letter)'),
  otherSocials: z.array(httpUrl).max(5, 'At most 5 links'),
  wallets: z.array(z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, 'Enter an EVM address (0x…)')).max(5).transform(dedupe),
  skills: z.array(z.string().max(40)).transform(dedupe).pipe(z.array(z.string()).max(30, 'At most 30 skills')),
  newsletterOptIn: z.boolean(),
  image: z.string().url().nullable(),
})

export type ProfileInput = z.input<typeof profileSchema>
export type Profile = z.output<typeof profileSchema>

/** What builders-hub requires before registering for events. */
export function hasCompleteBasicProfile(p: { name: string | null; country: string | null; builderRoles: string[] }): boolean {
  return !!p.name?.trim() && !!p.country && p.builderRoles.length > 0
}

/** Client form state (what the profile form edits; profileSchema validates it on save). */
export type ProfileFormValues = {
  name: string
  username: string | null
  bio: string | null
  country: string | null
  builderRoles: BuilderRole[]
  institution: string | null
  companyName: string | null
  employeeRole: string | null
  githubAccount: string | null
  xAccount: string | null
  linkedinAccount: string | null
  telegramAccount: string | null
  otherSocials: string[]
  wallets: string[]
  skills: string[]
  newsletterOptIn: boolean
  image: string | null
}
