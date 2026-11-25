'use client'

import Link from 'next/link'
import { StatusPill } from '@/components/status-pill'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { cn, initials } from '@/lib/utils'

export type ProjectPickerOption = {
  id: string
  slug: string
  name: string
  tagline: string
  imageUrl: string | null
  maturity: string | null
  versionNumber: number
  sealed: boolean
  members: number
  submittedVersion?: number | null
  missing: string[]
}

export function ProjectPicker({ projects, projectId, onChange, returnTo, name = 'project', invalid, describedBy }: {
  projects: ProjectPickerOption[]
  projectId: string
  onChange: (id: string) => void
  returnTo: string
  name?: string
  invalid?: boolean
  describedBy?: string
}) {
  const project = projects.find((p) => p.id === projectId)
  const back = encodeURIComponent(returnTo)
  return (
    <>
      <div className="grid gap-3">
        {projects.map((p) => (
          <label key={p.id} className={cn('flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors', projectId === p.id ? 'border-brand bg-brand/5' : invalid ? 'border-destructive' : 'border-line hover:border-fg-faint')}>
            <input type="radio" name={name} aria-describedby={describedBy} className="accent-[var(--color-brand)]" checked={projectId === p.id} onChange={() => onChange(p.id)} />
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
              <img src={p.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-line object-cover" />
            ) : (
              <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-lg border border-line bg-surface-1 text-brand">
                {initials(p.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-fg-heading">{p.name}</p>
                {p.submittedVersion && (p.submittedVersion === p.versionNumber && p.sealed
                  ? <StatusPill tone="success">Submitted · v{p.submittedVersion}</StatusPill>
                  : <StatusPill tone="warning">Submitted v{p.submittedVersion} · changed since</StatusPill>)}
              </div>
              <p className="truncate text-sm text-fg-muted">{p.tagline}</p>
              <p className="mt-1 text-xs text-fg-body">Stage: {PROJECT_MATURITY[p.maturity as ProjectMaturity]?.label ?? <span className="text-destructive">not set</span>}</p>
            </div>
            <p className="shrink-0 text-right text-xs text-fg-faint">Version {p.versionNumber}{p.sealed ? '' : ' · draft'}<br />{p.members} {p.members === 1 ? 'member' : 'members'}</p>
          </label>
        ))}
      </div>
      {project && project.missing.length > 0 && (
        <p role="alert" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          This project isn&apos;t complete yet - missing: {project.missing.join(', ')}.{' '}
          <Link href={`/projects/${project.slug}/edit?next=${back}`} className="underline decoration-brand underline-offset-2">Complete it</Link>
        </p>
      )}
      {project && (
        <p className="mt-3 text-sm text-fg-muted">
          {project.submittedVersion && project.submittedVersion === project.versionNumber && project.sealed
            ? `You submitted version ${project.versionNumber} and haven’t changed the project since.`
            : project.sealed
              ? `Submits version ${project.versionNumber}.`
              : `Submitting seals your project as version ${project.versionNumber} - exactly what reviewers see. Later edits start a new draft and don’t change this submission unless you update it here.`}{' '}
          <Link href={`/projects/${project.slug}/edit?next=${back}`} className="underline decoration-brand underline-offset-2">Edit the project first</Link>
        </p>
      )}
    </>
  )
}
