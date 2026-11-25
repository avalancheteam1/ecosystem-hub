'use client'

import { useEffect, useId, useRef, useState } from 'react'
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
import { roundClosedForSubmission, roundNotAccepting, shortDraft, shortSubmission, type ShortIntake } from '../_lib/schemas'
import { RoundIntakeStatus } from './navigation'
import type { GrantRoadmap } from './command-form'

type ExistingDraft = { id: string; revision: number; projectName: string; roundName: string; answers: ShortIntake }

export function ShortGrantForm({ draft, roundOpen = true, projects = [], roadmaps, rounds = [], initialProject = '' }: {
  draft?: ExistingDraft
  roundOpen?: boolean
  projects?: ProjectPickerOption[]
  roadmaps: GrantRoadmap[]
  rounds?: { id: string; name: string }[]
  initialProject?: string
}) {
  const uid = useId()
  const router = useRouter()
  const { run, pending } = useActionToast()
  const [projectId, setProject] = useState(initialProject)
  const [roundId, setRound] = useState(rounds[0]?.id ?? '')
  const [closedRounds, setClosedRounds] = useState<string[]>([])
  const canSubmit = roundOpen && !closedRounds.includes(roundId)
  const [amount, setAmount] = useState(draft?.answers.amountMinor ? String(draft.answers.amountMinor / 100) : '')
  const [summary, setSummary] = useState(draft?.answers.summary ?? '')
  const [milestone, setMilestone] = useState(draft?.answers.milestone ?? null)
  const [review, setReview] = useState<ShortIntake | null>(null)
  const [error, setError] = useState<{ text: string; field?: string } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const errorSummary = useRef<HTMLParagraphElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)
  const editingAfterReview = useRef(false)
  useEffect(() => {
    if (review) heading.current?.focus()
    else if (editingAfterReview.current) reviewButton.current?.focus()
  }, [review])
  useEffect(() => { if (error) errorSummary.current?.focus() }, [error])

  const roadmap = draft ? roadmaps[0] : roadmaps.find((p) => p.id === projectId)
  const roadmapItem = milestone?.source === 'roadmap' ? roadmap?.milestones.find((m) => m.id === milestone.id) : undefined
  const stale = milestone?.source === 'roadmap' &&
    (!roadmapItem || roadmapItem.title !== milestone.title || roadmapItem.targetDate !== milestone.due)
  const project = projects.find((p) => p.id === projectId)
  const errorProps = (field: string) => error?.field === field
    ? { 'aria-invalid': true as const, 'aria-describedby': `${uid}-error` }
    : {}

  function validate(submit: boolean) {
    if (!draft && (!project || !roundId)) {
      setError({ text: 'Choose a Hub project and an open application round.' })
      return
    }
    if (submit && !canSubmit) {
      setError({ text: draft ? roundClosedForSubmission : roundNotAccepting })
      return
    }
    if (submit && project?.missing.length) {
      setError({ text: 'Complete the missing project details before submitting.' })
      return
    }
    if (stale) {
      setError({ text: 'The roadmap milestone changed. Select it again or choose another milestone, then review the updated commitment.', field: 'milestone' })
      return
    }
    if (amount !== '' && !/^\d+$/.test(amount)) {
      setError({ text: 'Enter a whole-dollar amount from $1 to $10,000.', field: 'amountMinor' })
      return
    }
    const parsed = (submit ? shortSubmission : shortDraft).safeParse({
      intakeVersion: 2, amountMinor: amount === '' ? null : Number(amount) * 100, summary, milestone,
    })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue.path.join('.')
      setError({ text: field === 'amountMinor' ? 'Enter a whole-dollar amount from $1 to $10,000.' : issue.message, field })
      return
    }
    if (submit && parsed.data.milestone && parsed.data.milestone.due < new Date().toISOString().slice(0, 10)) {
      setError({ text: 'Choose a target date of today or later (UTC).', field: 'milestone.due' })
      return
    }
    setError(null)
    return parsed.data
  }

  function persist(answers: ShortIntake, submit: boolean) {
    void run(async () => {
      try {
        const result = draft
          ? await changeApplication({
              applicationId: draft.id, revision: draft.revision,
              command: submit ? { kind: 'submit_application', confirm: true, shortAnswers: answers } : { kind: 'save_application', answers },
            })
          : await createApplication({ projectId, roundId, answers, submit, confirm: submit })
        if (!result.ok) {
          if (result.error === roundClosedForSubmission || result.error === roundNotAccepting) {
            setClosedRounds((closed) => [...closed, roundId])
          }
          setError({ text: result.error })
        }
        if (result.ok && !draft) router.push(`/grants/applications/${result.data.id}`)
        return result
      } catch {
        const text = 'We could not confirm the result. Check the saved record before retrying.'
        setError({ text })
        return { ok: false, error: text }
      }
    }, submit ? 'Application submitted' : 'Draft saved')
  }

  const summaryError = error && <p id={`${uid}-error`} ref={errorSummary} tabIndex={-1} role="alert" className="text-sm text-destructive">{error.text}</p>

  if (review) return (
    <SectionCard className="space-y-5">
      <h2 ref={heading} tabIndex={-1} className="text-xl">Review your application</h2>
      <RoundIntakeStatus open={canSubmit} />
      <dl className="space-y-4">
        <div><dt>Project and round</dt><dd className="text-fg-muted">{draft?.projectName ?? project?.name} / {draft?.roundName ?? rounds.find((r) => r.id === roundId)?.name}</dd></div>
        {review.amountMinor !== null && <div><dt>Requested amount</dt><dd className="text-fg-muted">${(review.amountMinor / 100).toLocaleString('en-US')} USD</dd></div>}
        <div><dt>Work this grant will fund</dt><dd className="wrap-anywhere whitespace-pre-wrap text-fg-muted">{review.summary}</dd></div>
        <div><dt>Deliverable and target date</dt><dd className="wrap-anywhere text-fg-muted">{review.milestone?.title} · {review.milestone?.due} (UTC)</dd></div>
        <div><dt>Evidence of completion</dt><dd className="wrap-anywhere whitespace-pre-wrap text-fg-muted">{review.milestone?.evidence}</dd></div>
      </dl>
      <p className="text-sm text-fg-muted">Submitting sends this commitment for review and seals the current project version.</p>
      {summaryError}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => {
          editingAfterReview.current = true
          setReview(null)
          setError(null)
        }}>Back to edit</Button>
        <Button type="button" disabled={pending || !canSubmit} onClick={() => persist(review, true)}>Submit application</Button>
      </div>
    </SectionCard>
  )

  return (
    <form noValidate className="space-y-5" onChange={() => setError(null)} onSubmit={(event) => {
      event.preventDefault()
      const ready = validate(true)
      if (ready) setReview(ready)
    }}>
      <RoundIntakeStatus open={canSubmit} />
      {!draft && <SectionCard title="Project and round" className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Your Hub project</legend>
          <ProjectPicker projects={projects} projectId={projectId} onChange={(id) => {
            setProject(id)
            if (milestone?.source === 'roadmap') setMilestone(null)
          }} returnTo={`/grants/mini-grants/apply?project=${projectId}`} />
        </fieldset>
        <Field id={`${uid}-round`} label="Application round">
          <NativeSelect id={`${uid}-round`} value={roundId} onChange={(e) => setRound(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
      </SectionCard>}
      <SectionCard title="Funding request" className="space-y-4">
        <Field id={`${uid}-amount`} label="Requested amount (USD)" hint="Whole dollars, up to $10,000." required>
          <Input id={`${uid}-amount`} className="min-h-11" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} {...errorProps('amountMinor')} />
        </Field>
        <Field id={`${uid}-summary`} label="What will this grant fund?" required>
          <Textarea id={`${uid}-summary`} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} {...errorProps('summary')} />
        </Field>
      </SectionCard>
      <SectionCard title="Milestone commitment" className="space-y-4">
        <Field id={`${uid}-milestone`} label="Milestone" required>
          <NativeSelect id={`${uid}-milestone`} value={milestone?.source === 'roadmap' ? milestone.id : milestone?.source ?? ''} {...errorProps('milestone')}
            onChange={(event) => {
              const id = event.target.value
              const item = roadmap?.milestones.find((m) => m.id === id)
              setMilestone(id === 'application' ? { source: 'application', title: '', due: '', evidence: '' } :
                item ? { source: 'roadmap', id, title: item.title, due: item.targetDate, evidence: '' } : null)
            }}>
            <option value="">Choose a milestone</option>
            {stale && milestone?.source === 'roadmap' && <option value={milestone.id} disabled>{milestone.title} (saved selection needs review)</option>}
            {roadmap?.milestones.filter((m) => !stale || m.id !== (milestone?.source === 'roadmap' ? milestone.id : null)).map((m) =>
              <option value={m.id} key={m.id}>{m.title} · {m.targetDate}</option>
            )}
            <option value="application">Add a milestone for this application</option>
          </NativeSelect>
        </Field>
        {stale && <div className="space-y-2 text-sm">
          <p>The saved roadmap commitment changed or is no longer eligible.</p>
          {roadmapItem && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => setMilestone({
            source: 'roadmap', id: roadmapItem.id, title: roadmapItem.title, due: roadmapItem.targetDate, evidence: milestone?.evidence ?? '',
          })}>Use updated milestone · {roadmapItem.title} · {roadmapItem.targetDate}</Button>}
        </div>}
        {milestone?.source === 'roadmap' && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-fg-muted">Roadmap target date: {milestone.due} (UTC)</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => router.refresh()}>Refresh roadmap</Button>
          </div>
        )}
        {milestone?.source === 'application' && <>
          <Field id={`${uid}-deliverable`} label="Concrete deliverable" hint="This milestone belongs to the application only." required>
            <Input id={`${uid}-deliverable`} className="min-h-11" maxLength={250} value={milestone.title}
              onChange={(e) => setMilestone({ ...milestone, title: e.target.value })} {...errorProps('milestone.title')} />
          </Field>
          <Field id={`${uid}-due`} label="Target date (UTC)" required>
            <Input id={`${uid}-due`} className="min-h-11" type="date" value={milestone.due}
              onChange={(e) => setMilestone({ ...milestone, due: e.target.value })} {...errorProps('milestone.due')} />
          </Field>
        </>}
        {milestone && <Field id={`${uid}-evidence`} label="What evidence will show completion?" required
          hint="For example, a demo recording showing a successful replay and the passing test results. Describe what you’ll provide when the work is done.">
          <Textarea id={`${uid}-evidence`} maxLength={500} value={milestone.evidence}
            onChange={(e) => setMilestone({ ...milestone, evidence: e.target.value })} {...errorProps('milestone.evidence')} />
        </Field>}
      </SectionCard>
      {!canSubmit && <p className="text-sm text-fg-muted">{draft ? roundClosedForSubmission : 'Choose another open round, or return when this round reopens.'}</p>}
      {summaryError}
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="secondary" disabled={pending || (!draft && !canSubmit)} onClick={() => {
          const ready = validate(false)
          if (ready) persist(ready, false)
        }}>Save draft</Button>
        <Button ref={reviewButton} type="submit" disabled={pending || !canSubmit}>Review and submit</Button>
      </div>
    </form>
  )
}
