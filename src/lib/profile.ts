
// Builder profile fields - taken from builders-hub (battle-tested), with its
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

// Avalanche C-Chain / EVM address. Shared by the schema and the live check in the form.
export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/
export const WALLET_ERROR = 'Not a valid C-Chain address (0x followed by 40 hex characters)'

/** What builders-hub requires before registering for events. */
export function hasCompleteBasicProfile(p: { name: string | null; country: string | null; builderRoles: string[] }): boolean {
  return !!p.name?.trim() && !!p.country && p.builderRoles.length > 0
}

/** Client form state (what the profile form edits; profileSchema validates it on save). */
export type ProfileFormValues = {
  name: string
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
