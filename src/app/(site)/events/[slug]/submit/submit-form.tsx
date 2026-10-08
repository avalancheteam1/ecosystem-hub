'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ProjectForm } from '@/app/(app)/projects/_components/project-form'
import { submitToStage } from '@/app/(site)/events/_lib/hackathons/submission-actions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ChipToggle } from '@/components/chip-toggle'
import { AnswerFields, type AnswerField, type Answers } from '@/components/answer-fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'
import { cn } from '@/lib/utils'

type ProjectOption = { id: string; slug: string; name: string; tagline: string; imageUrl: string | null; maturity: string | null; versionNumber: number; sealed: boolean; members: number; missing: string[] }

function NewProjectDialog({ onCreated, primary }: { onCreated: (id: string) => void; primary?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={primary ? 'default' : 'outline'} size={primary ? 'default' : 'sm'}><Plus aria-hidden /> New project</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create it here — it’s selected for this submission when you save. Invite teammates from the project page.</DialogDescription>
        </DialogHeader>
        <ProjectForm
          onCancel={() => setOpen(false)}
          onSaved={({ id }) => {
            setOpen(false)
            onCreated(id)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

export function SubmitForm(props: {
  submitPath: string
  hackathonId: string
  stageId: string
  projects: ProjectOption[]
  /** Selected project (`?project=`); the page re-renders with its existing submission. */
  projectId: string
  /** false = the project is fixed (advanced team, or one submission per person). */
  canCreate: boolean
  tracks: { id: string; name: string }[]
  chooseTracks: boolean
  initialTrackIds: string[]
  fields: AnswerField[]
  initialAnswers: Answers
  initialPreexisting: boolean
  initialBuilt: string
  submittedVersion: number | null
}) {
  const router = useRouter()
  const projectId = props.projectId
  const setProjectId = (id: string) => router.replace(`${props.submitPath}?project=${encodeURIComponent(id)}`, { scroll: false })
  const [trackIds, setTrackIds] = useState(props.initialTrackIds)
  const [answers, setAnswers] = useState<Answers>(props.initialAnswers)
  const [preexistingIdea, setPreexisting] = useState(props.initialPreexisting)
  const [builtDuringEvent, setBuilt] = useState(props.initialBuilt)
  const { pending, run } = useActionToast()
  const project = props.projects.find((p) => p.id === projectId)
  const back = encodeURIComponent(`${props.submitPath}?project=${projectId}`)

  if (!props.projects.length) {
    return (
      <div className="text-center">
        <p className="text-fg-body">You need a project to submit. Create one — your teammates join it by invite.</p>
        <div className="mt-6"><NewProjectDialog primary onCreated={setProjectId} /></div>
      </div>
    )
  }

  return (
    <form
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          const res = await submitToStage({ hackathonId: props.hackathonId, stageId: props.stageId, projectId, trackIds, answers, preexistingIdea, builtDuringEvent })
          if (res.ok) router.push(`/events/${res.data.slug}`)
          return res
        }, props.submittedVersion ? 'Submission updated' : 'Submitted')
      }}
    >
      <fieldset>
        <div className="mb-3 flex items-center justify-between gap-3">
          <legend className="text-lg">Project</legend>
          {props.canCreate && <NewProjectDialog onCreated={setProjectId} />}
        </div>
        <div className="grid gap-3">
          {props.projects.map((p) => (
            <label key={p.id} className={cn('flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors', projectId === p.id ? 'border-brand bg-brand/5' : 'border-line hover:border-fg-faint')}>
              <input type="radio" name="project" className="accent-[var(--color-brand)]" checked={projectId === p.id} onChange={() => setProjectId(p.id)} />
              {p.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
                <img src={p.imageUrl} alt="" className="size-12 shrink-0 rounded-lg border border-line object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-fg-heading">{p.name}</p>
                <p className="truncate text-sm text-fg-muted">{p.tagline}</p>
                <p className="mt-1 text-xs text-fg-body">Stage: {PROJECT_MATURITY[p.maturity as ProjectMaturity]?.label ?? <span className="text-destructive">not set</span>}</p>
              </div>
              <p className="shrink-0 text-right text-xs text-fg-faint">Version {p.versionNumber}{p.sealed ? '' : ' · draft'}<br />{p.members} {p.members === 1 ? 'member' : 'members'}</p>
            </label>
          ))}
        </div>
        {project && project.missing.length > 0 && (
          <p role="alert" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            This project isn&apos;t complete yet — missing: {project.missing.join(', ')}.{' '}
            <Link href={`/projects/${project.slug}/edit?next=${back}`} className="underline decoration-brand underline-offset-2">Complete it</Link>
          </p>
        )}
        {project && (
          <p className="mt-3 text-sm text-fg-muted">
            {props.submittedVersion && props.submittedVersion === project.versionNumber && project.sealed
              ? `You submitted version ${project.versionNumber} and haven’t changed the project since.`
              : project.sealed
                ? `Submits version ${project.versionNumber}.`
                : `Submitting seals your project as version ${project.versionNumber} — exactly what judges see. Later edits start a new draft and don’t change this submission unless you update it here.`}{' '}
            <Link href={`/projects/${project.slug}/edit?next=${back}`} className="underline decoration-brand underline-offset-2">Edit the project first</Link>
          </p>
        )}
      </fieldset>

      {props.chooseTracks && props.tracks.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-lg">Tracks</legend>
          <ChipToggle label="Tracks" options={props.tracks.map((t) => ({ value: t.id, label: t.name }))} value={trackIds} onChange={setTrackIds} />
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-lg">Built during the hackathon?</legend>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox className="mt-0.5" checked={preexistingIdea} onCheckedChange={(c) => setPreexisting(c === true)} />
          <span>This project is based on a pre-existing idea or codebase</span>
        </label>
        {preexistingIdea && (
          <div className="space-y-2">
            <Label htmlFor="built">Explain what was built during the hackathon</Label>
            <p className="text-xs text-fg-faint">Clearly separate pre-existing work from new contributions, and mention significant changes or optimisations.</p>
            <Textarea id="built" rows={5} value={builtDuringEvent} onChange={(e) => setBuilt(e.target.value)} maxLength={5000} placeholder="New features, functionality or improvements developed during this event." />
          </div>
        )}
      </fieldset>

      {props.fields.length > 0 && (
        <fieldset>
          <legend className="mb-4 text-lg">Questions</legend>
          <AnswerFields fields={props.fields} value={answers} onChange={setAnswers} />
        </fieldset>
      )}

      <div><Button type="submit" size="lg" disabled={pending || !projectId || !!project?.missing.length}>{props.submittedVersion ? 'Update submission' : 'Submit project'}</Button></div>
    </form>
  )
}
