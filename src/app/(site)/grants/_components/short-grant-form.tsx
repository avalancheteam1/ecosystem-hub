'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Field } from '@/components/field'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { changeApplication, createApplication } from '../_lib/actions'
import { continuousIntakePaused, MAX_PLAN_MILESTONES, missingDemo, planDraft, planSubmission, roundClosedForSubmission, roundNotAccepting, shortDraft, shortSubmission, type PlanIntake, type ShortIntake } from '../_lib/schemas'
import { ApplicationChecklist } from './application-checklist'
import { GrantPlanSummary, ProjectDemoLinks } from './grant-plan-summary'
import { RoundIntakeStatus } from './navigation'
import type { GrantRoadmap } from './command-form'

type ShortAnswers = ShortIntake | PlanIntake
type ExistingDraft = { id: string; revision: number; projectName: string; roundName: string; answers: ShortAnswers }
const emptyMilestone = { source: 'application', title: '', due: '', evidence: '' } as const
type FormError = { text: string; field?: string }
const amountError = 'Enter a whole-dollar amount from $1 to $10,000.'

type ShortGrantFormProps = {
  continuous?: boolean
  demoProofMissing?: boolean
  draftProject?: { name: string; number: number; demoLinks: string[]; missing: string[] } | null
  draft?: ExistingDraft
  roundOpen?: boolean
  projects?: ProjectPickerOption[]
  roadmaps: GrantRoadmap[]
  rounds?: { id: string; name: string }[]
  initialProject?: string
}

export function ShortGrantForm(props: ShortGrantFormProps) {
  const [lastSave, setLastSave] = useState<{ revision: number; review: boolean } | null>(null)
  const revision = props.draft?.revision
  // Preview the matching server readback. A newer revision resets the editor.
  const saved = lastSave?.revision === revision ? lastSave : null

  return (
    <>
      <div role="status" className="sr-only">{saved && !saved.review ? 'Draft saved' : ''}</div>
      <ShortGrantFields key={revision} {...props}
        reviewSaved={saved?.review === true}
        waitingForSave={!!lastSave && lastSave.revision > (revision ?? -1)}
        justSaved={!!saved && !saved.review}
        onSave={setLastSave}
      />
    </>
  )
}

function ShortGrantFields({
  draft, draftProject, roundOpen = true, projects = [], roadmaps, rounds = [], initialProject = '', continuous = false, demoProofMissing = false,
  reviewSaved, waitingForSave, justSaved, onSave,
}: ShortGrantFormProps & {
  reviewSaved: boolean
  waitingForSave: boolean
  justSaved: boolean
  onSave: (save: { revision: number; review: boolean } | null) => void
}) {
  const uid = useId()
  const router = useRouter()
  const { run, pending } = useActionToast()
  const busy = pending || waitingForSave
  const [projectId, setProject] = useState(initialProject)
  const [roundId, setRound] = useState(rounds[0]?.id ?? '')
  const [closedRounds, setClosedRounds] = useState<string[]>([])
  const canSubmit = roundOpen && !closedRounds.includes(roundId)
  const closedMessage = continuous ? continuousIntakePaused : draft ? roundClosedForSubmission : 'Choose another open round, or return when this round reopens.'
  const [amount, setAmount] = useState(draft?.answers.amountMinor ? String(draft.answers.amountMinor / 100) : '')
  const [summary, setSummary] = useState(draft?.answers.summary ?? '')
  const multi = draft?.answers.intakeVersion === 3
  const [rows, setRows] = useState(() => (
    draft?.answers.intakeVersion === 3 ? draft.answers.milestones : [draft?.answers.milestone ?? null]
  ).map((milestone, key) => ({ milestone, key })))
  const nextKey = useRef(rows.length)
  const updateMilestone = (key: number, milestone: ShortIntake['milestone']) =>
    setRows((current) => current.map((row) => row.key === key ? { ...row, milestone } : row))
  const [localReview, setLocalReview] = useState<ShortAnswers | null>(null)
  const review = reviewSaved ? draft?.answers : localReview
  const [errors, setErrors] = useState<FormError[]>([])
  const heading = useRef<HTMLHeadingElement>(null)
  const errorSummary = useRef<HTMLDivElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)
  const saveButton = useRef<HTMLButtonElement>(null)
  const editingAfterReview = useRef(false)
  const nextFocus = useRef<string | null>(null)
  useEffect(() => {
    if (review) heading.current?.focus()
    else if (editingAfterReview.current) {
      reviewButton.current?.focus()
      editingAfterReview.current = false
    }
  }, [review])
  useEffect(() => { if (justSaved) saveButton.current?.focus() }, [justSaved])
  useEffect(() => { if (errors.length) errorSummary.current?.focus() }, [errors])
  useEffect(() => {
    if (nextFocus.current) document.getElementById(nextFocus.current)?.focus()
    nextFocus.current = null
  }, [rows])

  const roadmap = draft ? roadmaps[0] : roadmaps.find((p) => p.id === projectId)
  const roadmapItemFor = (milestone: ShortIntake['milestone']) =>
    milestone?.source === 'roadmap' ? roadmap?.milestones.find((m) => m.id === milestone.id) : undefined
  const isStale = (milestone: ShortIntake['milestone']) => {
    if (milestone?.source !== 'roadmap') return false
    const item = roadmapItemFor(milestone)
    return !item || item.title !== milestone.title || item.targetDate !== milestone.due
  }
  const project = projects.find((p) => p.id === projectId)
  const projectIssues = draftProject?.missing ?? project?.missing ?? []
  const missingProjectDetails = projectIssues.length > 0
  const projectDetailsError = `Your Hub project is missing ${projectIssues.join(', ')}.`
  const editProjectHref = draft && roadmap
    ? `/projects/${roadmap.slug}/edit?next=${encodeURIComponent(`/grants/applications/${draft.id}`)}`
    : undefined
  const fields: Record<string, string> = {
    project: `${uid}-project`, demo: `${uid}-demo`, amountMinor: `${uid}-amount`, summary: `${uid}-summary`,
    milestones: `${uid}-add`, roadmap: `${uid}-plan`,
  }
  rows.forEach(({ key, milestone }, index) => {
    const path = multi ? `milestones.${index}` : 'milestone'
    const source = `${uid}-${key}-milestone`
    fields[path] = source
    fields[`${path}.id`] = source
    fields[`${path}.title`] = milestone?.source === 'roadmap' ? source : `${uid}-${key}-deliverable`
    fields[`${path}.due`] = milestone?.source === 'roadmap' ? source : `${uid}-${key}-due`
    fields[`${path}.evidence`] = `${uid}-${key}-evidence`
  })

  const fieldMessage = (id: string) => errors.find(({ field }) => field && fields[field] === id)?.text
  const errorProps = (id: string, hint?: string) => ({
    'aria-invalid': !!fieldMessage(id) || undefined,
    'aria-describedby': [fieldMessage(id) && `${id}-error`, hint].filter(Boolean).join(' ') || undefined,
  })
  const inlineError = (id: string) => fieldMessage(id) && (
    <p id={`${id}-error`} className="border-s-2 border-destructive ps-2 text-sm font-medium text-fg-heading">{fieldMessage(id)}</p>
  )

  function validate(submit: boolean) {
    const found: FormError[] = []
    if (!draft && (!project || !roundId)) found.push({ text: 'Choose a Hub project and an open application round.', field: 'project' })
    if (submit && !canSubmit) found.push({ text: closedMessage })
    if (submit && missingProjectDetails) found.push({ text: projectDetailsError, field: 'project' })
    if (submit && demoProofMissing) found.push({ text: missingDemo, field: 'demo' })
    const amountMinor = amount === '' ? null : /^\d+$/.test(amount) ? Number(amount) * 100 : 0
    const today = new Date().toISOString().slice(0, 10)
    for (const [index, { milestone }] of rows.entries()) {
      const path = multi ? `milestones.${index}` : 'milestone'
      if (isStale(milestone)) found.push({ text: 'Choose a current roadmap milestone or add one for this application.', field: multi ? `${path}.id` : path })
      else if (submit && milestone?.due && milestone.due < today) found.push({ text: 'Choose a target date of today or later (UTC).', field: `${path}.due` })
    }
    const parsed = multi
      ? (submit ? planSubmission : planDraft).safeParse({
        intakeVersion: 3, amountMinor, summary, milestones: rows.flatMap(({ milestone }) => milestone ? [milestone] : []),
      })
      : (submit ? shortSubmission : shortDraft).safeParse({ intakeVersion: 2, amountMinor, summary, milestone: rows[0].milestone })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.')
        found.push({ text: field === 'amountMinor' ? amountError : issue.message, field })
      }
    }
    return { errors: found, answers: parsed.success && !found.length ? parsed.data : undefined }
  }

  function persist(answers: ShortAnswers, submit: boolean, preview = false) {
    void run(async () => {
      try {
        const result = draft
          ? await changeApplication({
              applicationId: draft.id, revision: draft.revision,
              command: submit ? {
                kind: 'submit_application', confirm: true,
                ...(answers.intakeVersion === 3 ? { planAnswers: answers } : { shortAnswers: answers }),
              } : { kind: 'save_application', answers },
            })
          : answers.intakeVersion === 2
            ? await createApplication({ projectId, roundId, answers, submit, confirm: submit })
            : { ok: false as const, error: 'Start a continuous Mini Grants application first.' }
        if (!result.ok) {
          if (result.error === roundClosedForSubmission || result.error === roundNotAccepting || result.error === continuousIntakePaused) {
            setClosedRounds((closed) => [...closed, roundId])
          }
          const field = result.error === missingDemo ? 'demo'
            : result.error.startsWith('The roadmap milestone changed') ? 'roadmap'
              : result.error.startsWith('Complete your project first:') ? 'project' : undefined
          if (field) {
            onSave(null)
            setLocalReview(null)
            router.refresh()
          }
          setErrors([{ text: result.error, field }])
        } else if (!draft) {
          router.push(`/grants/applications/${result.data.id}`)
        } else if (!submit && 'revision' in result.data && typeof result.data.revision === 'number') {
          onSave({ revision: result.data.revision, review: preview })
        }
        return result
      } catch {
        const text = 'We could not confirm the result. Check the saved record before retrying.'
        setErrors([{ text }])
        return { ok: false, error: text }
      }
    }, submit ? 'Application submitted' : 'Draft saved')
  }

  const summaryError = errors.length > 0 && (
    <div ref={errorSummary} tabIndex={-1} role="region" aria-labelledby={`${uid}-error-title`}
      className="scroll-mt-24 rounded-lg border border-destructive/60 bg-destructive/5 p-4 text-sm">
      <h3 id={`${uid}-error-title`} className="text-base font-medium text-fg-heading">Check your application</h3>
      <ul className="mt-1">
        {errors.map(({ text, field }) => {
          const id = field && fields[field]
          return <li key={`${field}:${text}`}>
            {id ? <a href={`#${id}`} onClick={(event) => {
              event.preventDefault()
              document.getElementById(id)?.focus()
            }} className="inline-flex min-h-11 items-center underline underline-offset-4">{text}</a> : <p className="py-2">{text}</p>}
          </li>
        })}
      </ul>
    </div>
  )
  const checklist = (reviewed: boolean) => {
    const remaining = validate(true).errors
    return <ApplicationChecklist project={!!draftProject && !missingProjectDetails} demo={!demoProofMissing}
      funding={!remaining.some(({ field }) => field === 'amountMinor' || field === 'summary')}
      milestones={!remaining.some(({ field }) => field?.startsWith('milestone'))} review={reviewed} />
  }
  const layout = 'grid items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-8'

  if (review) {
    const preview = (
      <SectionCard className="min-w-0 space-y-5 p-4 sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 text-xl">Review your application</h2>
        {!multi && <RoundIntakeStatus open={canSubmit} />}
        {review.intakeVersion === 3 && draftProject ? <GrantPlanSummary answers={review} project={draftProject} /> : <dl className="space-y-4">
          <div><dt>{continuous ? 'Project' : 'Project and round'}</dt><dd className="text-fg-muted">
            {draft?.projectName ?? project?.name}{!continuous && ` / ${draft?.roundName ?? rounds.find((r) => r.id === roundId)?.name}`}
          </dd></div>
          {review.amountMinor !== null && <div><dt>Requested amount</dt><dd className="text-fg-muted">${(review.amountMinor / 100).toLocaleString('en-US')} USD</dd></div>}
          <div><dt>Work this grant will fund</dt><dd className="wrap-anywhere whitespace-pre-wrap text-fg-muted">{review.summary}</dd></div>
          {(review.intakeVersion === 3 ? review.milestones : [review.milestone]).map((milestone, index) => (
            <div key={rows[index]?.key} className="space-y-1">
              <dt>{multi ? `Milestone ${index + 1}` : 'Deliverable and target date'}</dt>
              <dd className="wrap-anywhere text-fg-muted">{milestone?.title} · {milestone?.due} (UTC)</dd>
              <dt>Evidence of completion</dt>
              <dd className="wrap-anywhere whitespace-pre-wrap text-fg-muted">{milestone?.evidence}</dd>
            </div>
          ))}
        </dl>}
        <p className="text-sm text-fg-muted">Submitting sends this commitment for review and seals the current project version.</p>
        {summaryError}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => {
            editingAfterReview.current = true
            onSave(null)
            setLocalReview(null)
            setErrors([])
          }}>Back to edit</Button>
          <Button type="button" className="min-h-11" disabled={busy || !canSubmit} onClick={() => persist(review, true)}>Submit application</Button>
        </div>
      </SectionCard>
    )
    return multi ? <div className={layout}>{preview}{checklist(true)}</div> : preview
  }

  const editor = (
    <form noValidate aria-label="Grant application draft" className="min-w-0" onChange={() => setErrors((current) => current.length ? [] : current)} onSubmit={(event) => {
      event.preventDefault()
      if (busy) return
      const ready = validate(true)
      setErrors(ready.errors)
      if (!ready.answers) return
      if (multi) persist(ready.answers, false, true)
      else setLocalReview(ready.answers)
    }}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {!multi && <RoundIntakeStatus open={canSubmit} />}
        {summaryError}
        {!draft && <SectionCard title="Project and round" className="space-y-5">
          <fieldset id={fields.project} tabIndex={-1} className="scroll-mt-24">
            <legend className="mb-2 text-sm font-medium">Your Hub project</legend>
            <ProjectPicker projects={projects} projectId={projectId} onChange={(id) => {
              setProject(id)
              if (rows[0].milestone?.source === 'roadmap') updateMilestone(rows[0].key, null)
            }} returnTo={`/grants/mini-grants/apply?project=${projectId}`} />
          </fieldset>
          <Field id={`${uid}-round`} label="Application round">
            <NativeSelect id={`${uid}-round`} value={roundId} onChange={(e) => setRound(e.target.value)}>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </NativeSelect>
          </Field>
        </SectionCard>}
        {continuous && draft && (
          <SectionCard title="Working project or prototype" className="space-y-2 p-4 sm:p-6">
            <div id={fields.project} tabIndex={-1} className="scroll-mt-24">
              <p>{draftProject?.name ?? draft.projectName}{draftProject && ` · Version ${draftProject.number}`}</p>
              {missingProjectDetails && <p className="text-sm text-fg-muted">{projectDetailsError}</p>}
            </div>
            {demoProofMissing ? <p className="text-sm text-fg-muted" id={`${fields.demo}-hint`}>{missingDemo}</p>
              : <ProjectDemoLinks links={draftProject?.demoLinks ?? []} />}
            {editProjectHref && <>
              <Link id={fields.demo} aria-describedby={demoProofMissing ? `${fields.demo}-hint` : undefined}
                className="inline-flex min-h-11 scroll-mt-24 items-center text-sm underline underline-offset-4"
                href={editProjectHref}>{missingProjectDetails && !demoProofMissing ? 'Complete project details' : 'Edit project links'}</Link>
              <p className="text-sm text-fg-muted">Save your draft before leaving to edit the project.</p>
            </>}
          </SectionCard>
        )}
        <SectionCard title="Funding request" className="space-y-4 p-4 sm:p-6">
          <Field id={fields.amountMinor} label="Requested amount (USD)" required>
            <Input id={fields.amountMinor} className="min-h-11 max-w-56 scroll-mt-24" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-required="true" {...errorProps(fields.amountMinor, `${uid}-amount-hint`)} />
            {inlineError(fields.amountMinor)}
            <p id={`${uid}-amount-hint`} className="text-sm text-fg-muted">Whole dollars, up to $10,000.</p>
          </Field>
          <Field id={fields.summary} label="What will this grant fund?" required>
            <Textarea id={fields.summary} className="scroll-mt-24" maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} aria-required="true" {...errorProps(fields.summary)} />
            {inlineError(fields.summary)}
          </Field>
        </SectionCard>
        <SectionCard title={multi ? 'Milestone plan' : 'Milestone commitment'} className="space-y-4 p-4 sm:p-6">
          <p id={fields.roadmap} tabIndex={-1} className={`scroll-mt-24 text-sm text-fg-muted ${multi ? '' : 'sr-only'}`}>
            {multi ? 'Add one to three deliverables. Give each a target date and a way to check completion.' : 'Review the milestone commitment.'}
          </p>
          {rows.map(({ milestone, key }, index) => {
            const prefix = `${uid}-${key}`
            const roadmapItem = roadmapItemFor(milestone)
            const stale = isStale(milestone)
            return (
              <fieldset key={key} className={`min-w-0 space-y-4 ${multi ? 'rounded-lg border border-line p-3.5 sm:p-4' : ''}`}>
                {multi && <legend className="px-1 text-sm font-medium">Milestone {index + 1}</legend>}
                <Field id={`${prefix}-milestone`} label={multi ? 'Milestone source' : 'Milestone'} required>
                  <NativeSelect id={`${prefix}-milestone`} className="scroll-mt-24" aria-required="true" value={milestone?.source === 'roadmap' ? milestone.id : milestone?.source ?? ''} {...errorProps(`${prefix}-milestone`)}
                    onChange={(event) => {
                      const id = event.target.value
                      const item = roadmap?.milestones.find((m) => m.id === id)
                      updateMilestone(key, id === 'application' ? emptyMilestone :
                        item ? { source: 'roadmap', id, title: item.title, due: item.targetDate, evidence: '' } : null)
                    }}>
                    {!multi && <option value="">Choose a milestone</option>}
                    {stale && milestone?.source === 'roadmap' && <option value={milestone.id} disabled>{milestone.title} (saved selection needs review)</option>}
                    {roadmap?.milestones.filter((m) => !stale || m.id !== (milestone?.source === 'roadmap' ? milestone.id : null)).map((m) =>
                      <option value={m.id} key={m.id} disabled={rows.some((row) =>
                        row.key !== key && row.milestone?.source === 'roadmap' && row.milestone.id === m.id)}>{m.title} · {m.targetDate}</option>
                    )}
                    <option value="application">Add a milestone for this application</option>
                  </NativeSelect>
                  {inlineError(`${prefix}-milestone`)}
                </Field>
                {stale && <div className="space-y-2 text-sm">
                  <p>The saved roadmap commitment changed or is no longer eligible.</p>
                  {roadmapItem && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => {
                    setErrors([])
                    nextFocus.current = `${prefix}-milestone`
                    updateMilestone(key, { source: 'roadmap', id: roadmapItem.id, title: roadmapItem.title, due: roadmapItem.targetDate, evidence: milestone?.evidence ?? '' })
                  }}>Use updated milestone · {roadmapItem.title} · {roadmapItem.targetDate}</Button>}
                </div>}
                {milestone?.source === 'roadmap' && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm text-fg-muted">Roadmap target date: {milestone.due} (UTC)</p>
                    <Button type="button" variant="outline" className="min-h-11" onClick={() => router.refresh()}>Refresh roadmap</Button>
                  </div>
                )}
                {milestone?.source === 'application' && <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)]">
                  <Field id={`${prefix}-deliverable`} label="Concrete deliverable" required>
                    <Input id={`${prefix}-deliverable`} className="min-h-11 scroll-mt-24" maxLength={250} value={milestone.title} aria-required="true"
                      onChange={(e) => updateMilestone(key, { ...milestone, title: e.target.value })} {...errorProps(`${prefix}-deliverable`)} />
                    {inlineError(`${prefix}-deliverable`)}
                  </Field>
                  <Field id={`${prefix}-due`} label="Target date (UTC)" required>
                    <Input id={`${prefix}-due`} className="min-h-11 min-w-0 scroll-mt-24" type="date" value={milestone.due} aria-required="true"
                      onChange={(e) => updateMilestone(key, { ...milestone, due: e.target.value })} {...errorProps(`${prefix}-due`)} />
                    {inlineError(`${prefix}-due`)}
                  </Field>
                </div>}
                {milestone && <Field id={`${prefix}-evidence`} label="What evidence will show completion?" required>
                  <Textarea id={`${prefix}-evidence`} className="scroll-mt-24" maxLength={500} value={milestone.evidence} aria-required="true"
                    onChange={(e) => updateMilestone(key, { ...milestone, evidence: e.target.value })} {...errorProps(`${prefix}-evidence`, `${prefix}-evidence-hint`)} />
                  {inlineError(`${prefix}-evidence`)}
                  <p id={`${prefix}-evidence-hint`} className="text-sm text-fg-muted">For example, a recording that shows a successful replay and the passing test results.</p>
                </Field>}
                {multi && <Button type="button" variant="ghost" className="min-h-11" aria-label={`Remove milestone ${index + 1}`} onClick={() => {
                  const nextRow = rows[index + 1] ?? rows[index - 1]
                  nextFocus.current = nextRow ? `${uid}-${nextRow.key}-milestone` : fields.milestones
                  setRows((current) => current.filter((row) => row.key !== key))
                  setErrors([])
                }}>Remove milestone</Button>}
              </fieldset>
            )
          })}
          {multi && inlineError(fields.milestones)}
          {multi && rows.length < MAX_PLAN_MILESTONES && <Button id={fields.milestones} type="button" variant="outline" className="min-h-11 scroll-mt-24" {...errorProps(fields.milestones)} onClick={() => {
            const key = nextKey.current++
            nextFocus.current = `${uid}-${key}-milestone`
            setRows((current) => [...current, { key, milestone: emptyMilestone }])
            setErrors([])
          }}>Add milestone</Button>}
        </SectionCard>
        {!canSubmit && <p className="text-sm text-fg-muted">{closedMessage}</p>}
        <div className="flex flex-wrap gap-3">
          <Button ref={saveButton} type="button" variant="secondary" className="min-h-11" disabled={busy || (!draft && !canSubmit)} onClick={() => {
            const ready = validate(false)
            setErrors(ready.errors)
            if (ready.answers) persist(ready.answers, false)
          }}>Save draft</Button>
          <Button ref={reviewButton} type="submit" className="min-h-11" disabled={busy || !canSubmit}>{multi ? 'Continue to review' : 'Review and submit'}</Button>
        </div>
      </fieldset>
    </form>
  )

  return multi ? <div className={layout}>{editor}{checklist(false)}</div> : editor
}
