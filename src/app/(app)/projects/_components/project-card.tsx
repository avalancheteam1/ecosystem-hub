import Link from 'next/link'
import { Flag, Plus } from 'lucide-react'
import { projectNudge } from '@/app/(app)/dashboard/_lib/highlights'
import { formatRelative, formatShortDate } from '@/lib/dates'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { cn, initials } from '@/lib/utils'
import { missingForSubmission } from '../_lib/rules'

// The maturity ladder without "archived" - the steps a project climbs.
const LADDER: ProjectMaturity[] = (Object.keys(PROJECT_MATURITY) as ProjectMaturity[]).filter((k) => k !== 'archived')
type CardProject = {
  slug: string
  currentVersion: ({ name: string; logoUrl: string | null; maturity: string | null; updatedAt: Date } & Parameters<typeof missingForSubmission>[0]) | null
  milestones: { title: string; targetDate: string }[]
}

/** The project grid shared by the dashboard and /projects, ending in a "new project" tile. */
export function ProjectGrid({ projects, now }: { projects: (CardProject & { id: string })[]; now: Date }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p, i) => (
        <li key={p.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
          <ProjectCard p={p} now={now} />
        </li>
      ))}
      <li>
        <Link href="/projects/new" className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-6 text-center text-fg-muted transition duration-200 hover:border-brand hover:text-fg-heading">
          <Plus className="size-6 text-brand" aria-hidden />
          <span>{projects.length === 0 ? 'Add your first project' : 'New project'}</span>
          <span className="text-xs text-fg-faint">Describe it once, submit it to hackathons and grants.</span>
        </Link>
      </li>
    </ul>
  )
}

/** `milestones` = the next open one (or none). */
function ProjectCard({ p, now }: { p: CardProject; now: Date }) {
  const v = p.currentVersion
  if (!v) return null
  const archived = v.maturity === 'archived'
  const step = LADDER.indexOf(v.maturity as ProjectMaturity)
  const next = p.milestones[0] ?? null
  const nudge = projectNudge({ daysSinceUpdate: Math.floor((now.getTime() - v.updatedAt.getTime()) / 86_400_000), maturity: v.maturity, nextMilestone: next, missing: missingForSubmission(v).length })
  return (
    <Link href={`/projects/${p.slug}`} className={cn('flex h-full flex-col rounded-xl border border-line bg-surface-2 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow', archived && 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0')}>
      <div className="flex items-center gap-4">
        {v.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- own upload
          <img src={v.logoUrl} alt="" className="size-12 shrink-0 rounded-xl border border-line object-cover" />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-surface-1 text-brand">{initials(v.name)}</span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-lg">{v.name}</h3>
          <p className="text-xs text-fg-faint">Updated {formatRelative(v.updatedAt, now)}</p>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-fg-body">{v.maturity ? PROJECT_MATURITY[v.maturity as ProjectMaturity]?.label : 'Stage not set'}</span>
          {step >= 0 && <span className="text-xs text-fg-faint">{step + 1} / {LADDER.length}</span>}
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {LADDER.map((k, i) => <span key={k} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-brand' : 'bg-surface-hover')} />)}
        </div>
      </div>
      {next && (
        <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
          <Flag className="size-4 shrink-0 text-brand" aria-hidden />
          <span className="truncate">Next: {next.title}</span>
          <span className="ml-auto shrink-0 text-xs text-fg-faint">{formatShortDate(new Date(`${next.targetDate}T00:00:00Z`), 'UTC', now)}</span>
        </p>
      )}
      {nudge && <p className="mt-auto pt-4 text-sm text-warning">{nudge}</p>}
    </Link>
  )
}
