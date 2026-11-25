'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ProjectPicker, type ProjectPickerOption } from '@/components/project-picker'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/native-select'
import { Checkbox } from '@/components/ui/checkbox'
import { useActionToast } from '@/hooks/use-action-toast'
import { changeApplication, createApplication } from '../_lib/actions'
import { answers, commandSchema, createSchema, money } from '../_lib/schemas'

export type GrantRoadmap = { id: string; slug: string; milestones: { id: string; title: string; targetDate: string }[] }
export type GrantRepeater = { path: string; label: string; limit: number; template: Record<string, unknown>; fields: GrantField[] }
export type GrantField = {
  path: string
  label: string
  type?: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox'
  options?: { value: string; label: string }[]
  hint?: string
  optional?: boolean
  maxLength?: number
}
const read = (data: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined), data)
function write(data: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.')
  let target: Record<string, unknown> = data
  for (const key of keys.slice(0, -1)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid field')
    if (!target[key] || typeof target[key] !== 'object') target[key] = {}
    target = target[key] as Record<string, unknown>
  }
  target[keys.at(-1)!] = value
}

/** One form contract for the native grant writes; the server revalidates and authorizes each command. */
export function GrantCommandForm({
  applicationId,
  revision,
  data,
  fields,
  label,
  dialog = false,
  create = false,
  repeaters = [],
  initialStep = 0,
  roadmaps = [],
  roundOpen = true,
  triggerAriaLabel,
  recoverUnknownResult = false,
  secondaryTrigger = false,
  outcomeSubmitLabels,
  projectOptions = [],
}: {
  applicationId?: string
  revision?: number
  data: Record<string, unknown>
  fields: GrantField[]
  label: string
  dialog?: boolean
  create?: boolean
  repeaters?: GrantRepeater[]
  initialStep?: number
  roadmaps?: GrantRoadmap[]
  roundOpen?: boolean
  triggerAriaLabel?: string
  recoverUnknownResult?: boolean
  secondaryTrigger?: boolean
  outcomeSubmitLabels?: Readonly<Partial<Record<string, string>>>
  projectOptions?: ProjectPickerOption[]
}) {
  const uid = useId(),
    router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams(),
    { pending, run } = useActionToast()
  const [counts, setCounts] = useState(() =>
    Object.fromEntries(
      repeaters.map((r) => [r.path, Math.max(1, Array.isArray(read(data, r.path)) ? (read(data, r.path) as unknown[]).length : 1)]),
    ),
  )
  const repeatedFields = repeaters.flatMap((r) =>
    Array.from({ length: counts[r.path] }, (_, i) =>
      r.fields.map((f) => ({ ...f, path: `${r.path}.${i}.${f.path}`, label: `${r.label} ${i + 1}: ${f.label}` })),
    ).flat(),
  )
  const allFields = [...fields, ...repeatedFields]
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      allFields.map((f) => {
        const value = read(data, f.path)
        return [
          f.path,
          f.type === 'checkbox'
            ? value === true
            : value === null || value === undefined
              ? ''
              : f.type === 'money'
                ? (Number(value) / 100).toFixed(2)
                : String(value),
        ]
      }),
    ),
  )
  const wizard = create || data.kind === 'save_application'
  const [step, setStep] = useState(initialStep),
    [confirmed, setConfirmed] = useState(false),
    [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const goStep = (value: number) => {
    setStep(value)
    const next = new URLSearchParams(params.toString())
    next.set('step', ['project', 'outcome', 'milestone', 'review'][value])
    router.replace(`${pathname}?${next}`, { scroll: false })
  }
  const [refreshingRoadmap, refreshRoadmap] = useTransition()
  const [error, setError] = useState<{ path?: string; message: string } | null>(null)
  const errorSummary = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (error) errorSummary.current?.focus() }, [error])
  const groupFor = (path: string) => ['projectId', 'roundId'].includes(path)
    ? 0 : ['answers.problem', 'answers.outcome', 'answers.whyGrant', 'answers.capability'].includes(path) ? 1 : 2
  const roadmap = create ? roadmaps.find((project) => project.id === values.projectId) : roadmaps[0]
  const milestone = roadmap?.milestones.find((m) => m.id === values['answers.projectMilestoneId'])
  const milestoneOptions = roadmap?.milestones.map((m) => ({ value: m.id, label: `${m.title} · ${m.targetDate}` })) ?? []
  const optionsFor = (f: GrantField) => f.path === 'answers.projectMilestoneId' ? milestoneOptions : f.options
  const fail = (message: string, path?: string) => {
    setError({ path, message })
    if (wizard && path) goStep(groupFor(path))
    return false
  }
  const showIssue = (issue?: { path: PropertyKey[]; message: string }) => {
    const path = issue?.path.join('.') ?? ''
    const field = allFields.find((f) => f.path === path)
    const message = path === 'projectId' ? 'Choose the Hub project you want to apply with.'
      : path === 'roundId' ? 'Choose an open round.'
      : field ? `${field.label}: ${!values[path] && field.type !== 'checkbox' ? 'Enter a value.' : issue?.message}`
        : issue?.message || 'Check the application and try again.'
    return fail(message, field?.path || (wizard && path === 'answers.costs' ? 'answers.costs.0.amountMinor' : undefined))
  }
  async function submit(submitNow = false) {
    const payload = structuredClone(data)
    if (create) {
      payload.submit = submitNow
      payload.confirm = confirmed
    }
    if (submitNow && !roundOpen) return fail('This round is closed. You can still save your draft.')
    if (submitNow && !confirmed) return fail('Confirm before submitting the application.')
    if (create && !values.projectId) return fail('Choose the Hub project you want to apply with.', 'projectId')
    if (create && !values.roundId) return fail('Choose an open round.', 'roundId')
    if (submitNow && create && projectOptions.find((project) => project.id === values.projectId)?.missing.length)
      return fail('Complete the missing project details before submitting.', 'projectId')
    if (submitNow && !milestone) return fail('Choose a milestone from your project roadmap before submitting.', 'answers.projectMilestoneId')
    if (submitNow && !String(values['answers.whyGrant'] ?? '').trim())
      return fail('Explain why this grant would make a difference.', 'answers.whyGrant')
    for (const r of repeaters)
      write(
        payload,
        r.path,
        Array.from({ length: counts[r.path] }, () => structuredClone(r.template)),
      )
    for (const f of allFields) {
      const raw = values[f.path] ?? ''
      if (f.type === 'money') {
        if (f.optional && (raw === '' || Number(raw) === 0)) {
          write(payload, f.path, 0)
          continue
        }
        const parsed = money.safeParse(raw)
        if (!parsed.success) {
          return fail(`${f.label}: Enter a dollar amount from $1 to $10,000 with up to two decimal places.`, f.path)
        }
        write(payload, f.path, parsed.data)
      } else write(payload, f.path, f.type === 'number' ? (raw === '' ? null : Number(raw)) : raw)
    }
    if (wizard) {
      write(payload, 'answers.projectMilestoneId', milestone?.id)
      write(payload, 'answers.terms.title', milestone?.title ?? '')
      write(payload, 'answers.terms.due', milestone?.targetDate ?? '')
    }
    if (payload.kind === 'record_decision' && payload.outcome !== 'approved') payload.terms = null
    if (submitNow && !create) {
      const complete = answers.safeParse(payload.answers)
      if (!complete.success) {
        const issue = complete.error.issues[0]
        return showIssue(issue && { ...issue, path: ['answers', ...issue.path] })
      }
    }
    const parsed = create ? createSchema.safeParse(payload) : commandSchema.safeParse(payload)
    if (!parsed.success) {
      return showIssue(parsed.error.issues[0])
    }
    setError(null)
    try {
      return await run(
        async () => {
          if (create) {
            const result = await createApplication(createSchema.parse(payload))
            if (result.ok) router.push(`/grants/applications/${result.data.id}`)
            return result
          }
          const saved = await changeApplication({
            applicationId: applicationId!,
            revision: revision!,
            command: commandSchema.parse(payload),
          }).catch((error: unknown) => {
            if (!recoverUnknownResult) throw error
            const message = 'We could not confirm the result. Check the saved record before retrying.'
            fail(message)
            return { ok: false as const, error: message }
          })
          if (saved.ok && submitNow && data.kind === 'save_application')
            return changeApplication({
              applicationId: applicationId!,
              revision: saved.data.revision,
              command: { kind: 'submit_application', confirm: true },
            })
          return saved
        },
        submitNow ? 'Application submitted' : create || data.kind === 'save_application' ? 'Draft saved' : 'Grant record saved',
      )
    } catch {
      toast.error('The request could not complete. Refresh to check the latest record before retrying.')
      return false
    }
  }
  const renderField = (f: GrantField, i: number) => {
    const fieldId = `${uid}-${i}`,
      value = values[f.path] ?? ''
    const invalid = error?.path === f.path
    const descriptors = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? `${uid}-form-error` : undefined }
    const update = (v: string | boolean) => {
      setConfirmed(false)
      setValues((old) => ({ ...old, [f.path]: v, ...(f.path === 'projectId' ? { 'answers.projectMilestoneId': '' } : {}) }))
      if (invalid) setError(null)
    }
    if (f.path === 'projectId' && projectOptions.length)
      return (
        <fieldset key={f.path}>
          <legend className="mb-2 text-lg">Your Hub project</legend>
          <ProjectPicker projects={projectOptions} projectId={String(value)} onChange={update}
            returnTo={`${pathname}?project=${encodeURIComponent(String(value))}`} name={fieldId} invalid={invalid}
            describedBy={descriptors['aria-describedby']} />
        </fieldset>
      )
    if (f.type === 'checkbox')
      return (
        <label key={f.path} className="flex min-h-11 items-start gap-3 text-sm">
          <Checkbox {...descriptors} id={fieldId} checked={value === true} onCheckedChange={(v) => update(v === true)} className="mt-1" />
          <span>{f.label}</span>
        </label>
      )
    return (
      <Field key={f.path} id={fieldId} label={f.label} hint={f.hint}>
        {f.type === 'select' ? (
          <NativeSelect {...descriptors} id={fieldId} value={String(value)} onChange={(e) => update(e.target.value)} required={!f.optional}>
            <option value="">Choose</option>
            {optionsFor(f)?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        ) : f.type === 'textarea' ? (
          <Textarea
            {...descriptors}
            id={fieldId}
            value={String(value)}
            onChange={(e) => update(e.target.value)}
            required={!f.optional}
            rows={4}
            maxLength={f.maxLength ?? 10000}
          />
        ) : (
          <Input
            {...descriptors}
            id={fieldId}
            className="h-11"
            type={f.type === 'money' ? 'text' : f.type || 'text'}
            inputMode={f.type === 'money' ? 'decimal' : undefined}
            value={String(value)}
            onChange={(e) => update(e.target.value)}
            required={!f.optional}
            step={f.type === 'number' ? 'any' : undefined}
            maxLength={f.maxLength ?? 10000}
          />
        )}
        {f.path === 'answers.projectMilestoneId' && roadmap && (
          <div className="text-sm text-fg-muted">
            <p>{milestoneOptions.length ? 'Title and target date come from the project roadmap.' : 'This project has no planned or in-progress milestone with a current target date.'}</p>
            <div className="flex flex-wrap items-center gap-x-3">
              <Link href={`/projects/${roadmap.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-fg-heading underline underline-offset-4">
                Open project roadmap <span className="sr-only">(opens in a new tab)</span>
              </Link>
              <Button type="button" variant="ghost" disabled={refreshingRoadmap} onClick={() => refreshRoadmap(() => router.refresh())}>
                {refreshingRoadmap ? 'Refreshing milestones…' : 'Refresh milestones'}
              </Button>
            </div>
          </div>
        )}
      </Field>
    )
  }
  const visibleFields = allFields.filter((f) => {
    if (data.kind === 'record_decision' && String(values.outcome ?? data.outcome) !== 'approved' && f.path.startsWith('terms.'))
      return false
    if (!wizard) return true
    return groupFor(f.path) === step
  })
  const fieldsIn = (match: (field: GrantField) => boolean) =>
    visibleFields.map((field, index) => match(field) ? renderField(field, index) : null)
  const reviewFields = (items: GrantField[]) => (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {items.filter((field) => field.type !== 'checkbox').map((field) => (
        <div key={field.path} className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}>
          <dt className="text-sm text-fg-muted">{field.label}</dt>
          <dd className="wrap-anywhere whitespace-pre-wrap">
            {(optionsFor(field)?.find((option) => option.value === values[field.path])?.label
              ?? (field.type === 'select' ? '' : String(values[field.path] ?? ''))) || 'Not yet provided'}
          </dd>
        </div>
      ))}
    </dl>
  )
  const assessmentIds = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9']
  const content = (
    <>
      {error && (
        <p ref={errorSummary} id={`${uid}-form-error`} tabIndex={-1} role="alert" className="border-l-2 border-destructive pl-3 text-sm text-fg-heading">
          {error.message}
        </p>
      )}
      {wizard && (
        <nav aria-label="Application steps" className="mb-6 grid grid-cols-2 gap-2 border-b border-line sm:flex sm:flex-wrap">
            {['Project', 'Funding request', 'Milestone & budget', 'Review & submit'].map((name, index) => (
            <Button
              type="button"
              key={name}
              variant="ghost"
              aria-current={step === index ? 'step' : undefined}
              onClick={() => goStep(index)}
              className={step === index ? 'justify-start rounded-none border-b-2 border-brand' : 'justify-start rounded-none'}
            >
              {name}
            </Button>
          ))}
        </nav>
      )}
      {wizard && step === 0 && !create && (
        <p className="text-sm text-fg-muted">
          This draft reuses your saved Hub project and current team. Your project version is sealed only on submission.
        </p>
      )}
      {wizard && step === 3 && (
        <div className="space-y-5">
          <h2 className="text-lg">Review the application</h2>
          {create && <SectionCard title="Project and round">{reviewFields(fields.filter((field) => groupFor(field.path) === 0))}</SectionCard>}
          <SectionCard title="Funding request">{reviewFields(fields.filter((field) => groupFor(field.path) === 1))}</SectionCard>
          <SectionCard title="Milestone and delivery">{reviewFields(fields.filter((field) => groupFor(field.path) === 2))}</SectionCard>
          {repeatedFields.length > 0 && <SectionCard title="Cost breakdown">{reviewFields(repeatedFields)}</SectionCard>}
          {!roundOpen && <p className="text-sm text-fg-muted">This round is closed. You can still save your draft.</p>}
          <label className="flex min-h-11 items-start gap-3">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-1" />
            <span>I confirm this application is accurate and ready for review. Submission seals the current project version.</span>
          </label>
        </div>
      )}

      {data.kind === 'save_assessment' ? (
        <>
          {assessmentIds.map((id, index) => {
            const row = visibleFields.filter((f) => f.path.startsWith(`assessment.criteria.${id}.`))
            return (
              <fieldset key={id} className="border-b border-line py-0.5">
                <legend className="sr-only">{row[0]?.label}</legend>
                <div className="grid grid-cols-[minmax(0,1fr)_2rem_3.5rem_3.25rem] items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_2.5rem_4.5rem_4rem]">
                  <button
                    type="button"
                    aria-expanded={expanded[id] === true}
                    aria-controls={`${uid}-detail-${id}`}
                    onClick={() => setExpanded((old) => ({ ...old, [id]: !old[id] }))}
                    className="min-h-11 text-left"
                  >
                    {row[0]?.label}
                  </button>
                  <span className="text-xs text-fg-muted">{id === 'c9' ? '20%' : '10%'}</span>
                  {row
                    .filter((f) => f.type === 'select')
                    .map((f, i) => (
                      <div key={f.path} className="[&_label]:sr-only [&_select]:pr-6 [&_select]:pl-2">
                        {renderField(f, index * 4 + i)}
                      </div>
                    ))}
                </div>
                {expanded[id] && (
                  <div id={`${uid}-detail-${id}`} className="space-y-4 py-3">
                    {row.filter((f) => f.type !== 'select').map((f, i) => renderField(f, 100 + index * 4 + i))}
                  </div>
                )}
              </fieldset>
            )
          })}
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center">Other readiness conditions</summary>
            <div className="space-y-4 py-4">
              {visibleFields.filter((f) => f.path.includes('.clearances.')).map((f, i) => renderField(f, 200 + i))}
            </div>
          </details>
          {visibleFields.filter((f) => f.path === 'assessment.note').map((f) => renderField(f, 300))}
        </>
      ) : wizard && step === 1 ? (
        <SectionCard title="What the grant will fund" className="space-y-4">
          {visibleFields.map(renderField)}
        </SectionCard>
      ) : wizard && step === 2 ? (
        <>
          <SectionCard title="Project milestone and delivery" className="space-y-4">
            {fieldsIn((field) => field.path === 'answers.projectMilestoneId' || (field.path.startsWith('answers.terms.') && field.path !== 'answers.terms.amountMinor'))}
            {fieldsIn((field) => ['answers.maintenance', 'answers.risks'].includes(field.path))}
          </SectionCard>
          <SectionCard title="Requested amount and costs" description="List the costs that make up the requested amount. Their total must match your request." className="space-y-4">
            {fieldsIn((field) => field.path === 'answers.terms.amountMinor' || field.path === 'answers.funding' || field.path.startsWith('answers.costs.'))}
          </SectionCard>
        </>
      ) : data.kind === 'record_decision' ? (
        <>
          {fieldsIn((field) => field.path === 'outcome' || field.path === 'ownerId')}
          {visibleFields.some((field) => field.path.startsWith('terms.')) && (
            <SectionCard title="Award amount and terms" className="space-y-4">
              {fieldsIn((field) => field.path.startsWith('terms.'))}
            </SectionCard>
          )}
          <SectionCard title="Internal decision record" className="space-y-4">
            {fieldsIn((field) => ['budget', 'authority', 'rationale'].includes(field.path))}
          </SectionCard>
          {fieldsIn((field) => field.path === 'publicNote')}
        </>
      ) : (
        visibleFields.map(renderField)
      )}
      {(!wizard || step === 2) &&
        repeaters.map((r) => (
          <div key={r.path} className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={counts[r.path] >= r.limit}
              onClick={() => setCounts((old) => ({ ...old, [r.path]: old[r.path] + 1 }))}
            >
              Add {r.label.toLowerCase()}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={counts[r.path] <= 1}
              onClick={() => setCounts((old) => ({ ...old, [r.path]: old[r.path] - 1 }))}
            >
              Remove last {r.label.toLowerCase()}
            </Button>
          </div>
        ))}
    </>
  )
  return dialog ? (
    <FormDialog title={triggerAriaLabel ?? label} trigger={<Button variant={secondaryTrigger ? 'secondary' : 'default'} aria-label={triggerAriaLabel}>{label}</Button>} submitLabel={outcomeSubmitLabels?.[String(values.outcome)] ?? label} pending={pending} onSubmit={() => submit()}>
      {content}
    </FormDialog>
  ) : (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (wizard && step < 3) {
          if (step === 0 && create && !values.projectId) fail('Choose the Hub project you want to apply with.', 'projectId')
          else if (step === 0 && create && !values.roundId) fail('Choose an open round.', 'roundId')
          else if (step === 2 && !milestone) fail('Choose a milestone from your project roadmap before continuing.', 'answers.projectMilestoneId')
          else { setError(null); goStep(step + 1) }
        } else void submit(wizard)
      }}
    >
      {content}
      <div className="flex flex-wrap justify-between gap-3">
        {wizard && (
          <>
            <Button type="button" variant="secondary" disabled={step === 0 || pending} onClick={() => goStep(step - 1)}>
              Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                void submit(false)
              }}
            >
              Save draft
            </Button>
          </>
        )}
        <Button type="submit" disabled={pending || (wizard && step === 3 && !roundOpen)}>
          {pending ? 'Saving...' : wizard ? (step < 3 ? 'Continue' : 'Submit application') : label}
        </Button>
      </div>
    </form>
  )
}
