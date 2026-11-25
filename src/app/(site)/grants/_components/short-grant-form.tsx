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
import { RoundIntakeStatus } from './navigation'
import type { GrantRoadmap } from './command-form'

type ShortAnswers = ShortIntake | PlanIntake
type ExistingDraft = { id: string; revision: number; projectName: string; roundName: string; answers: ShortAnswers }
const emptyMilestone = { source: 'application', title: '', due: '', evidence: '' } as const

export function ShortGrantForm({ draft, roundOpen = true, projects = [], roadmaps, rounds = [], initialProject = '', continuous = false, demoProofMissing = false }: {
  continuous?: boolean
  demoProofMissing?: boolean
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
  const [review, setReview] = useState<ShortAnswers | null>(null)
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
  const roadmapItemFor = (milestone: ShortIntake['milestone']) =>
    milestone?.source === 'roadmap' ? roadmap?.milestones.find((m) => m.id === milestone.id) : undefined
  const isStale = (milestone: ShortIntake['milestone']) => {
    if (milestone?.source !== 'roadmap') return false
    const item = roadmapItemFor(milestone)
    return !item || item.title !== milestone.title || item.targetDate !== milestone.due
  }
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
      setError({ text: closedMessage })
      return
    }
    if (submit && demoProofMissing) {
      setError({ text: missingDemo })
      return
    }
    if (submit && project?.missing.length) {
      setError({ text: 'Complete the missing project details before submitting.' })
      return
    }
    const staleIndex = rows.findIndex(({ milestone }) => isStale(milestone))
    if (staleIndex !== -1) {
      setError({ text: 'The roadmap milestone changed. Select it again or choose another milestone, then review the updated commitment.', field: multi ? `milestones.${staleIndex}.id` : 'milestone' })
      return
    }
    if (amount !== '' && !/^\d+$/.test(amount)) {
      setError({ text: 'Enter a whole-dollar amount from $1 to $10,000.', field: 'amountMinor' })
      return
    }
    const amountMinor = amount === '' ? null : Number(amount) * 100
    const parsed = multi
      ? (submit ? planSubmission : planDraft).safeParse({
        intakeVersion: 3, amountMinor, summary, milestones: rows.flatMap(({ milestone }) => milestone ? [milestone] : []),
      })
      : (submit ? shortSubmission : shortDraft).safeParse({ intakeVersion: 2, amountMinor, summary, milestone: rows[0].milestone })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue.path.join('.')
      setError({ text: field === 'amountMinor' ? 'Enter a whole-dollar amount from $1 to $10,000.' : issue.message, field })
      return
    }
    const overdue = rows.findIndex(({ milestone }) => milestone && milestone.due < new Date().toISOString().slice(0, 10))
    if (submit && overdue !== -1) {
      setError({ text: 'Choose a target date of today or later (UTC).', field: multi ? `milestones.${overdue}.due` : 'milestone.due' })
      return
    }
    setError(null)
    return parsed.data
  }

  function persist(answers: ShortAnswers, submit: boolean) {
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
            if (rows[0].milestone?.source === 'roadmap') updateMilestone(rows[0].key, null)
          }} returnTo={`/grants/mini-grants/apply?project=${projectId}`} />
        </fieldset>
        <Field id={`${uid}-round`} label="Application round">
          <NativeSelect id={`${uid}-round`} value={roundId} onChange={(e) => setRound(e.target.value)}>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
      </SectionCard>}
      {continuous && draft && roadmap && demoProofMissing && (
        <SectionCard title="Working project or prototype">
          <p className="text-sm text-fg-muted">{missingDemo}</p>
          <Link
            className="inline-flex min-h-11 items-center underline"
            href={`/projects/${roadmap.slug}/edit?next=${encodeURIComponent(`/grants/applications/${draft.id}`)}`}
          >Edit project links</Link>
        </SectionCard>
      )}
      <SectionCard title="Funding request" className="space-y-4">
        <Field id={`${uid}-amount`} label="Requested amount (USD)" hint="Whole dollars, up to $10,000." required>
          <Input id={`${uid}-amount`} className="min-h-11" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} {...errorProps('amountMinor')} />
        </Field>
        <Field id={`${uid}-summary`} label="What will this grant fund?" required>
          <Textarea id={`${uid}-summary`} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} {...errorProps('summary')} />
        </Field>
      </SectionCard>
      <SectionCard title={multi ? 'Milestone plan' : 'Milestone commitment'} className="space-y-4">
        {multi && <p className="text-sm text-fg-muted">Choose one to three deliverables. Each must have its own target date and evidence of completion.</p>}
        {rows.map(({ milestone, key }, index) => {
          const prefix = `${uid}-${key}`
          const path = multi ? `milestones.${index}` : 'milestone'
          const roadmapItem = roadmapItemFor(milestone)
          const stale = isStale(milestone)
          return (
            <fieldset key={key} className="space-y-4">
              {multi && <legend className="mb-2 text-sm font-medium">Milestone {index + 1}</legend>}
              <Field id={`${prefix}-milestone`} label={multi ? 'Milestone source' : 'Milestone'} required>
                <NativeSelect id={`${prefix}-milestone`} value={milestone?.source === 'roadmap' ? milestone.id : milestone?.source ?? ''} {...errorProps(multi ? `${path}.id` : path)}
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
              </Field>
              {stale && <div className="space-y-2 text-sm">
                <p>The saved roadmap commitment changed or is no longer eligible.</p>
                {roadmapItem && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => updateMilestone(key, {
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
                <Field id={`${prefix}-deliverable`} label="Concrete deliverable" hint="This milestone belongs to the application only." required>
                  <Input id={`${prefix}-deliverable`} className="min-h-11" maxLength={250} value={milestone.title}
                    onChange={(e) => updateMilestone(key, { ...milestone, title: e.target.value })} {...errorProps(`${path}.title`)} />
                </Field>
                <Field id={`${prefix}-due`} label="Target date (UTC)" required>
                  <Input id={`${prefix}-due`} className="min-h-11" type="date" value={milestone.due}
                    onChange={(e) => updateMilestone(key, { ...milestone, due: e.target.value })} {...errorProps(`${path}.due`)} />
                </Field>
              </>}
              {milestone && <Field id={`${prefix}-evidence`} label="What evidence will show completion?" required
                hint="For example, a demo recording showing a successful replay and the passing test results. Describe what you’ll provide when the work is done.">
                <Textarea id={`${prefix}-evidence`} maxLength={500} value={milestone.evidence}
                  onChange={(e) => updateMilestone(key, { ...milestone, evidence: e.target.value })} {...errorProps(`${path}.evidence`)} />
              </Field>}
              {multi && <Button type="button" variant="ghost" className="min-h-11" aria-label={`Remove milestone ${index + 1}`} onClick={() => {
                setRows((current) => current.filter((row) => row.key !== key))
                setError(null)
              }}>Remove milestone</Button>}
            </fieldset>
          )
        })}
        {multi && rows.length < MAX_PLAN_MILESTONES && <Button type="button" variant="outline" className="min-h-11" onClick={() => {
          const key = nextKey.current++
          setRows((current) => [...current, { key, milestone: emptyMilestone }])
          setError(null)
        }}>Add milestone</Button>}
      </SectionCard>
      {!canSubmit && <p className="text-sm text-fg-muted">{closedMessage}</p>}
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
