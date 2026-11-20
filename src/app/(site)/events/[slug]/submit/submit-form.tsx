'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { ProjectInviteForm, type ProjectInviteAction } from '@/components/project-invite-form'
import { ProjectForm } from '@/app/(app)/projects/_components/project-form'
import { submissionBanner, type SubmissionConfirmation } from '@/lib/submission-status'
import { saveHackathonDraft, submitToStage } from '@/app/(site)/events/_lib/hackathons/submission-actions'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ChipToggle } from '@/components/chip-toggle'
import { AnswerFields, type AnswerField, type Answers } from '@/components/answer-fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'
import { useFormErrors } from '@/hooks/use-form-errors'
import { submissionDetailsSchema } from '../../_lib/hackathons/schemas'

type ProjectOption = ProjectPickerOption & { canInvite: boolean; confirmation: SubmissionConfirmation; teamNames: string[]; warnings: string[]; links: { video: string | null; repositories: string[]; liveApp: string | null; demos: string[] } }

type CountryProps = { optionalProjectFields?: string[]; countries: { code: string; name: string }[]; defaultCountry: string | null }

function NewProjectDialog({ onCreated, primary, countries, defaultCountry, optionalProjectFields }: { onCreated: (id: string) => void; primary?: boolean } & CountryProps) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={primary ? 'default' : 'outline'} size={primary ? 'default' : 'sm'}><Plus aria-hidden /> New project</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>Create it here - it’s selected for this submission when you save. After saving, invite teammates here before submitting.</DialogDescription>
        </DialogHeader>
        <ProjectForm
          optionalProjectFields={optionalProjectFields}
          countries={countries}
          defaultCountry={defaultCountry}
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
  inviteAction: ProjectInviteAction
  timeZone: string
  hackathonName: string
  submittedAt: string | null
  submitPath: string
  hackathonId: string
  stageId: string
  projects: ProjectOption[]
  /** Selected project (`?project=`); the page re-renders with its existing submission. */
  projectId: string
  /** false = the project is fixed (advanced team, or one submission per person). */
  canCreate: boolean
  tracks: { id: string; name: string }[]
  sponsorPrizes: { id: string; name: string; sponsor: string; eligibilityHint: string | null }[]
  initialSponsorPrizeIds: string[]
  chooseTracks: boolean
  initialTrackIds: string[]
  fields: AnswerField[]
  initialAnswers: Answers
  initialPreexisting: boolean
  initialBuilt: string
  submittedVersion: number | null
} & CountryProps) {
  const router = useRouter()
  const projectId = props.projectId
  const setProjectId = (id: string) => router.replace(`${props.submitPath}?project=${encodeURIComponent(id)}`, { scroll: false })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const submitButton = useRef<HTMLButtonElement>(null)
  const [trackIds, setTrackIds] = useState(props.initialTrackIds)
  const [sponsorPrizeIds, setSponsorPrizeIds] = useState(props.initialSponsorPrizeIds)
  const [answers, setAnswers] = useState<Answers>(props.initialAnswers)
  const [preexistingIdea, setPreexisting] = useState(props.initialPreexisting)
  const [builtDuringEvent, setBuilt] = useState(props.initialBuilt)
  const validation = useFormErrors({ builtDuringEvent: 'built', ...Object.fromEntries(props.fields.map((f) => [`answers.${f.id}`, `ans-${f.id}`])) })
  const { pending, run } = useActionToast()
  const project = props.projects.find((p) => p.id === projectId)
  const onProjectCreated = (id: string) => run(async () => {
    const saved = await saveHackathonDraft({ hackathonId: props.hackathonId, projectId: id })
    if (saved.ok) setProjectId(id)
    return saved
  }, 'Draft saved, not submitted')

  if (!props.projects.length) {
    return (
      <div className="text-center">
        <p className="text-fg-body">You need a project to submit. Create one - your teammates join it by invite.</p>
        <div className="mt-6"><NewProjectDialog primary onCreated={onProjectCreated} countries={props.countries} defaultCountry={props.defaultCountry} optionalProjectFields={props.optionalProjectFields} /></div>
      </div>
    )
  }

  return (
    <form
      noValidate
      className="grid gap-10"
      onSubmit={(e) => {
        e.preventDefault()
        if (e.target !== e.currentTarget) return
        if (validation.validate(submissionDetailsSchema(props.fields), { answers, preexistingIdea, builtDuringEvent })) setConfirmOpen(true)
      }}
    >
      <div role="status" className="rounded-lg border border-line bg-surface-1 p-4 text-lg">{submissionBanner(props.submittedAt ? 'active' : null, props.submittedAt ? new Date(props.submittedAt) : null, props.timeZone)}</div>
      <fieldset>
        <div className="mb-3 flex items-center justify-between gap-3">
          <legend className="text-lg">Project</legend>
          {props.canCreate && <NewProjectDialog onCreated={onProjectCreated} countries={props.countries} defaultCountry={props.defaultCountry} optionalProjectFields={props.optionalProjectFields} />}
        </div>
        <ProjectPicker projects={props.projects} projectId={projectId} onChange={setProjectId} returnTo={`${props.submitPath}?project=${encodeURIComponent(projectId)}`} optionalProjectFields={props.optionalProjectFields} />
      </fieldset>

      {project && <section id="team-invitations" aria-label="Team invitations" className="space-y-4 rounded-lg border border-line p-4">
        {project.warnings.length > 0 && <div role="alert"><h2 className="text-lg">Check your team before submitting</h2><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{project.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>}
        {project.canInvite ? <Dialog>
          <DialogTrigger asChild><Button type="button" variant="outline">Invite teammates by email</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Invite teammates by email</DialogTitle><DialogDescription>Invite a writer to {project.name}. They must accept the invitation and register for this hackathon before submission.</DialogDescription></DialogHeader><ProjectInviteForm key={project.id} projectId={project.id} inviteAction={props.inviteAction} /></DialogContent>
        </Dialog> : <p className="text-sm text-fg-muted">Ask the project owner to invite teammates by email.</p>}
        <p className="text-sm text-fg-muted">An invitation does not register a teammate or include them in your submission.</p>
        <Link href={`/projects/${project.slug}`} className="inline-flex min-h-11 items-center underline">Review team and invitations</Link>
      </section>}
      {props.chooseTracks && props.tracks.length > 0 && (
        <fieldset>
          <legend className="mb-3 text-lg">Tracks (Optional)</legend>
          <Button type="button" variant={trackIds.length ? "outline" : "secondary"} aria-pressed={!trackIds.length} onClick={() => setTrackIds([])} className="mb-3">No track / free project</Button>
          <ChipToggle label="Tracks" options={props.tracks.map((t) => ({ value: t.id, label: t.name }))} value={trackIds} onChange={setTrackIds} />
        </fieldset>
      )}

      {props.sponsorPrizes.length > 0 && <fieldset>
        <legend className="mb-3 text-lg">Sponsor technologies used / prizes competing for (Optional)</legend>
        <ChipToggle label="Sponsor prizes" options={props.sponsorPrizes.map((p) => ({ value: p.id, label: `${p.sponsor}: ${p.name}` }))} value={sponsorPrizeIds} onChange={setSponsorPrizeIds} />
        <ul className="mt-3 space-y-2 text-sm text-fg-muted">{props.sponsorPrizes.filter((p) => sponsorPrizeIds.includes(p.id) && p.eligibilityHint).map((p) => <li key={p.id}>{p.name}: {p.eligibilityHint}</li>)}</ul>
      </fieldset>}

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
            <Textarea {...validation.props('builtDuringEvent')} id="built" rows={5} value={builtDuringEvent} onChange={(e) => setBuilt(e.target.value)} maxLength={5000} placeholder="New features, functionality or improvements developed during this event." />
            {validation.errors.builtDuringEvent && <p id="built-error" role="alert" className="text-sm text-destructive">{validation.errors.builtDuringEvent}</p>}
          </div>
        )}
      </fieldset>

      {props.fields.length > 0 && (
        <fieldset>
          <legend className="mb-4 text-lg">Questions</legend>
          <AnswerFields errors={Object.fromEntries(props.fields.map((f) => [f.id, validation.errors[`answers.${f.id}`]]))} fields={props.fields} value={answers} onChange={setAnswers} />
        </fieldset>
      )}

      {validation.errors.form && <p role="alert" className="text-sm text-destructive">{validation.errors.form}</p>}
      <div className="flex flex-wrap gap-3"><Button ref={submitButton} type="submit" size="lg" className="h-auto min-h-12 max-w-full whitespace-normal" disabled={pending || !projectId || !!project?.missing.length}>{props.submittedVersion ? `Update submission to ${props.hackathonName}` : `Submit to ${props.hackathonName}`}</Button>
        <Button type="button" variant="outline" disabled={pending || !projectId} onClick={() => run(async () => { const res = await saveHackathonDraft({ hackathonId: props.hackathonId, projectId }); if (res.ok && project) router.push(`/projects/${project.slug}`); return res }, props.submittedVersion ? 'Project saved for this hackathon' : 'Draft saved, not submitted')}>{props.submittedVersion ? 'Open project' : 'Save draft for this hackathon'}</Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); submitButton.current?.focus() }} className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Confirm submission to {props.hackathonName}</DialogTitle><DialogDescription>Judges receive this project version, joined team members, selections and answers. Pending invitations are excluded.</DialogDescription></DialogHeader>
          {project && (
            <div className="space-y-3 text-sm">
              <p><strong>{project.name}</strong> · version {project.versionNumber}</p>
              <p>Team: {project.teamNames.join(', ')}</p>
              <p>Tracks: {trackIds.map((id) => props.tracks.find((t) => t.id === id)?.name).filter(Boolean).join(', ') || 'No track / free project'}</p>
              <p>Sponsor prizes: {sponsorPrizeIds.map((id) => props.sponsorPrizes.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || 'None'}</p>
              <p className="break-all">Demo video: {project.links.video || 'None'}</p>
              <p className="break-all">Repository: {project.links.repositories.join(', ') || 'None'}</p>
              <p className="break-all">Live app: {project.links.liveApp || 'None'}</p>
              <p className="break-all">Demo links: {project.links.demos.join(', ') || 'None'}</p>
              {project.warnings.map((w) => <p key={w} className="text-warning">{w}</p>)}
              <p>Pre-existing idea: {preexistingIdea ? 'Yes' : 'No'}</p>
              {builtDuringEvent && <p>{builtDuringEvent}</p>}
              {props.fields.map((f) => <p key={f.id}>{f.label}: {Array.isArray(answers[f.id]) ? (answers[f.id] as string[]).join(', ') : String(answers[f.id] ?? 'Not answered')}</p>)}
            </div>
          )}
          <Button
            type="button"
            disabled={pending}
            onClick={() => run(async () => {
              const res = await submitToStage({ hackathonId: props.hackathonId, stageId: props.stageId, projectId, confirmation: project!.confirmation, trackIds, sponsorPrizeIds, answers, preexistingIdea, builtDuringEvent })
              if (!res.ok) {
                setConfirmOpen(false)
                validation.fail(`${res.error} Review the project, team and event timeline, then try again.`)
              }
              if (res.ok && project) {
                setConfirmOpen(false)
                router.push(`/projects/${project.slug}`)
                router.refresh()
              }
              return res
            }, props.submittedVersion ? 'Submission updated' : 'Submitted')}
          >Confirm and submit</Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Keep editing</Button>
        </DialogContent>
      </Dialog>
    </form>
  )
}
