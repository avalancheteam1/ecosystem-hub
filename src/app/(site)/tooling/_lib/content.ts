import content from '../_content/tools.json'
import type { ToolingContent } from './rules'

// Content lives in git (`_content/tools.json`), added and changed by PR - the PR review is the listing review.
export const TOOLING: ToolingContent = content

export const getTool = (slug: string) => TOOLING.tools.find((t) => t.slug === slug) ?? null
export const categoryLabel = (slug: string) => TOOLING.categories.find((c) => c.slug === slug)?.label ?? slug
