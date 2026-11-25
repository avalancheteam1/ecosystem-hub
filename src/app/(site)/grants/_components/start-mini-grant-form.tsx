'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { startApplication } from '../_lib/actions'

export function StartMiniGrantForm({ projects, initialProject = '' }: { projects: ProjectPickerOption[]; initialProject?: string }) {
  const [projectId, setProject] = useState(initialProject)
  const { run, pending } = useActionToast()
  const router = useRouter()

  return (
    <SectionCard>
      <form className="space-y-5" onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          try {
            const result = await startApplication({ projectId })
            if (result.ok) router.push(`/grants/applications/${result.data.id}`)
            return result
          } catch {
            return { ok: false, error: 'Could not open the application. Try again to continue with this project.' }
          }
        }, 'Application opened')
      }}>
        <fieldset disabled={pending}>
          <legend className="mb-3 text-lg">Choose your Hub project</legend>
          <ProjectPicker projects={projects} projectId={projectId} onChange={setProject} returnTo={`/grants/mini-grants/apply?project=${projectId}`} />
        </fieldset>
        <Button type="submit" disabled={!projectId || pending}>Continue to application</Button>
      </form>
    </SectionCard>
  )
}
