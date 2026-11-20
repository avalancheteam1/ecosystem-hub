// Shared by project drafts and hackathon setup/submission. Identity and consent
// are never optional; these are the built-in submission-completeness questions.
export const PROJECT_REQUIREMENTS = {
  maturity: 'Project stage',
  fullDescription: 'Full description',
  techDescription: 'How it’s made',
  techStack: 'Tech stack',
  githubRepos: 'Code repository',
  demoLinks: 'Website or demo link',
  videoUrl: 'Demo video',
} as const
export type ProjectRequirement = keyof typeof PROJECT_REQUIREMENTS

type ProjectRequirementsInput = { maturity: string | null; fullDescription: string; techDescription: string; techStack: string[]; githubRepos: string[]; demoLinks: string[]; websiteUrl: string | null; videoUrl?: string | null }

export function missingProjectRequirements(v: ProjectRequirementsInput, optional: readonly string[] = ['videoUrl']): string[] {
  const filled: Record<ProjectRequirement, boolean> = {
    videoUrl: !!v.videoUrl?.trim(),
    maturity: !!v.maturity,
    fullDescription: !!v.fullDescription.trim(),
    techDescription: !!v.techDescription.trim(),
    techStack: v.techStack.length > 0,
    githubRepos: v.githubRepos.length > 0,
    demoLinks: v.demoLinks.length > 0 || !!v.websiteUrl,
  }
  return (Object.keys(PROJECT_REQUIREMENTS) as ProjectRequirement[]).filter((key) => !optional.includes(key) && !filled[key]).map((key) => PROJECT_REQUIREMENTS[key])
}

export function projectRequirementLabel(key: ProjectRequirement, optional: readonly string[]): string {
  return `${PROJECT_REQUIREMENTS[key]}${optional.includes(key) ? ' (Optional)' : ''}`
}
