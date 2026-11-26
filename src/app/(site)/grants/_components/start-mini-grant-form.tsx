'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { FieldRequirement } from '@/components/field'
import { useRouter } from 'next/navigation'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { startApplication } from '../_lib/actions'
import { hasDemoProof } from '../_lib/schemas'
import { ApplicationChecklist } from './application-checklist'
import { ProjectDemoLinks } from './grant-plan-summary'

export function StartMiniGrantForm({ projects, initialProject = '' }: { projects: (ProjectPickerOption & { demoLinks: string[] })[]; initialProject?: string }) {
  const uid = useId()
  const [projectId, setProject] = useState(initialProject)
  const [error, setError] = useState<{ text: string; selection?: boolean } | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const { run, pending } = useActionToast()
  const router = useRouter()
  const project = projects.find(({ id }) => id === projectId)
  const returnTo = `/grants/mini-grants/apply?project=${projectId}`

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8">
      <form className="min-w-0 space-y-4" onSubmit={(event) => {
        event.preventDefault()
        if (!project) {
          setError({ text: 'Choose a Hub project to continue.', selection: true })
          return
        }
        setError(null)
        void run(async () => {
          try {
            const result = await startApplication({ projectId })
            if (result.ok) router.push(`/grants/applications/${result.data.id}`)
            else setError({ text: result.error })
            return result
          } catch {
            const message = 'Could not open the application. Try again to continue with this project.'
            setError({ text: message })
            return { ok: false, error: message }
          }
        }, 'Application opened')
      }}>
        <SectionCard className="p-4 sm:p-6">
          <fieldset disabled={pending} className="min-w-0">
            <legend className="mb-3 text-lg">Choose your Hub project<FieldRequirement>required to continue</FieldRequirement></legend>
            {error && <p id={`${uid}-error`} ref={errorRef} tabIndex={-1} role="alert" className="mb-3 border-s-2 border-destructive ps-2 text-sm font-medium text-fg-heading">{error.text}</p>}
            <ProjectPicker projects={projects} projectId={projectId} onChange={(id) => {
              setProject(id)
              setError(null)
            }} returnTo={returnTo} invalid={error?.selection} describedBy={error?.selection ? `${uid}-error` : undefined} />
          </fieldset>
        </SectionCard>
        {project && <SectionCard title="Working project or prototype" className="space-y-2 p-4 sm:p-6">
          <ProjectDemoLinks links={project.demoLinks} />
          <p className="text-sm text-fg-muted">A working demo link is required for submission. You can start a draft now.</p>
          {!hasDemoProof(project.demoLinks) && <Link href={`/projects/${project.slug}/edit?next=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Edit project links</Link>}
        </SectionCard>}
        <Button type="submit" className="min-h-11" disabled={pending}>Continue to application</Button>
      </form>
      <ApplicationChecklist project={!!project && !project.missing.length} demo={!!project && hasDemoProof(project.demoLinks)} />
    </div>
  )
}
