'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { changeApplication } from '../_lib/actions'
import { commandSchema, money, terms, type Terms } from '../_lib/schemas'

const detailFields = [
  { key: 'amount', label: 'Amount to issue (USD)' },
  { key: 'maintainer', label: 'Who will maintain the work?' },
  { key: 'verifier', label: 'Who verified the milestone?' },
  { key: 'budget', label: 'Budget authorization reference' },
  { key: 'authority', label: 'Approval reference' },
] as const
const emptyDetails = {
  amount: '', maintainer: '', verifier: '', budget: '', authority: '',
  route: '', hypothesis: '', limits: '', ownerId: '',
}

export function StaffAwardForm({
  applicationId, revision, milestone, requested, owners, evaluationHref, establishedHolds,
}: {
  applicationId: string
  revision: number
  milestone: Pick<Terms, 'title' | 'due' | 'acceptance'>
  requested?: string
  owners: { value: string; label: string }[]
  evaluationHref: string
  establishedHolds: string[]
}) {
  const id = useId()
  const { pending, run } = useActionToast()
  const [details, setDetails] = useState(emptyDetails)
  const [entered, setEntered] = useState<{ fields: typeof emptyDetails; terms: Terms }>()
  const [detailError, setDetailError] = useState('')
  const [publicNote, setPublicNote] = useState('')
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState('')
  const pilot = details.route === 'bounded_pilot'
  const routeHolds = entered?.terms.route === 'established_impact' ? establishedHolds : []
  const EvaluationLink = evaluationHref.startsWith('#') ? 'a' : Link

  function enterDetails() {
    const parsedAmount = money.safeParse(details.amount.trim())
    if (!parsedAmount.success) {
      setDetailError('Enter an amount from $1 to $10,000 with up to two decimal places.')
      return false
    }
    const parsed = terms.safeParse({
      ...milestone,
      amountMinor: parsedAmount.data,
      maintainer: details.maintainer,
      verifier: details.verifier,
      route: details.route,
      hypothesis: pilot ? details.hypothesis.trim() : '',
      limits: pilot ? details.limits.trim() : '',
    })
    if (!parsed.success || !details.budget.trim() || !details.authority.trim() || (pilot && (!details.hypothesis.trim() || !details.limits.trim()))) {
      setDetailError('Complete the award details before continuing.')
      return false
    }
    setEntered({ fields: details, terms: parsed.data })
    setError('')
    return true
  }

  async function issue() {
    if (!entered || routeHolds.length || pending) return
    const command = commandSchema.safeParse({
      kind: 'record_decision', outcome: 'approved', terms: entered.terms, ownerId: entered.fields.ownerId,
      authority: entered.fields.authority, budget: entered.fields.budget, publicNote, rationale,
    })
    if (!command.success) {
      setError('Enter the applicant note and staff-only reason before issuing the award.')
      return
    }
    setError('')
    await run(async () => {
      const result = await changeApplication({ applicationId, revision, command: command.data }).catch(() => ({
        ok: false as const, error: 'We could not confirm the result. Check the saved record before retrying.',
      }))
      if (!result.ok) setError(result.error)
      return result
    }, 'Award issued')
  }

  const facts: { label: string; value?: string; fullWidthOnMobile?: boolean }[] | undefined = entered && [
    { label: 'Decision owner', value: owners.find((owner) => owner.value === entered.fields.ownerId)?.label },
    { label: 'Funding route', value: entered.terms.route === 'bounded_pilot' ? 'Bounded pilot' : 'Established impact' },
    { label: 'Budget authorization reference', value: entered.fields.budget, fullWidthOnMobile: true },
    { label: 'Approval reference', value: entered.fields.authority, fullWidthOnMobile: true },
    { label: 'Maintainer', value: entered.terms.maintainer },
    { label: 'Milestone verifier', value: entered.terms.verifier },
    ...(entered.terms.route === 'bounded_pilot'
      ? [{ label: 'Pilot hypothesis', value: entered.terms.hypothesis }, { label: 'Pilot limits', value: entered.terms.limits }]
      : []),
  ]

  return (
    <div className="space-y-5">
      {routeHolds.length > 0 && <div className="space-y-2 border-l-2 border-line pl-4" role="status">
        <p className="font-medium">Assessment required for established impact</p>
        <ul className="list-disc space-y-1 pl-5">
          {routeHolds.map((hold) => (
            <li key={hold}>{hold === 'Established impact requires c9 at least 2E'
              ? 'A reviewer needs to score Realized Avalanche impact at least 2 and support it with evidence.'
              : hold}</li>
          ))}
        </ul>
        <p>The grant reviewer updates the assessment before the decision owner can issue.</p>
        <EvaluationLink href={evaluationHref} className="inline-flex min-h-11 items-center underline underline-offset-4">{evaluationHref.startsWith('#') ? 'Go to assessment' : 'Open evaluation'}</EvaluationLink>
      </div>}
      <div className="space-y-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{entered ? 'Entered details' : 'Award details needed'}</h3>
          <FormDialog
            title="Award details"
            description="Enter the approved terms and references. These details stay on this page until you issue the award."
            trigger={<Button type="button" variant="secondary" disabled={pending}>{entered ? 'Edit award details' : 'Add award details'}</Button>}
            submitLabel="Use these details"
            onOpenChange={(open) => {
              if (open) {
                setDetails(entered?.fields ?? emptyDetails)
                setDetailError('')
              }
            }}
            onSubmit={enterDetails}
          >
            {detailError && <p role="alert" className="text-destructive">{detailError}</p>}
            <Field id={id + '-owner'} label="Decision owner" requirement="required">
              <NativeSelect id={id + '-owner'} value={details.ownerId} onChange={(event) => setDetails({ ...details, ownerId: event.target.value })} required>
                <option value="">Choose</option>
                {owners.map((owner) => <option key={owner.value} value={owner.value}>{owner.label}</option>)}
              </NativeSelect>
            </Field>
            <Field id={id + '-route'} label="Funding route" requirement="required">
              <NativeSelect id={id + '-route'} value={details.route} onChange={(event) => setDetails({ ...details, route: event.target.value })} required>
                <option value="">Choose</option>
                <option value="bounded_pilot">Bounded pilot</option>
                <option value="established_impact">Established impact</option>
              </NativeSelect>
            </Field>
            {detailFields.map(({ key, label }) => (
              <Field key={key} id={id + '-' + key} label={label} requirement="required">
                <Input id={id + '-' + key} value={details[key]} onChange={(event) => setDetails({ ...details, [key]: event.target.value })}
                  inputMode={key === 'amount' ? 'decimal' : undefined} maxLength={key === 'budget' ? 2000 : 10000} required />
              </Field>
            ))}
            {pilot && (['hypothesis', 'limits'] as const).map((key) => (
              <Field key={key} id={id + '-' + key} label={key === 'hypothesis' ? 'Pilot hypothesis' : 'Pilot limits'} requirement="required">
                <Textarea id={id + '-' + key} value={details[key]} onChange={(event) => setDetails({ ...details, [key]: event.target.value })} maxLength={10000} required />
              </Field>
            ))}
          </FormDialog>
        </div>
        <p className="text-sm text-fg-muted">
          {entered ? 'Leaving or reloading this page discards the entered details.'
            : 'The decision owner enters the amount, terms and required references before issuing.'}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {requested && <div>
            <dt className="text-sm text-fg-muted">Requested amount</dt>
            <dd>{requested}</dd>
          </div>}
          <div>
            <dt className="text-sm text-fg-muted">Amount to issue</dt>
            <dd>{entered ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(entered.terms.amountMinor / 100) : 'Not entered'}</dd>
          </div>
          {facts?.map(({ label, value, fullWidthOnMobile }) => (
            <div key={label} className={fullWidthOnMobile ? 'col-span-2 min-w-0 sm:col-span-1' : 'min-w-0'}>
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="wrap-anywhere whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void issue() }}>
        <Field id={id + '-public-note'} label="Note for the applicant" requirement="required">
          <Textarea id={id + '-public-note'} value={publicNote} onChange={(event) => setPublicNote(event.target.value)} maxLength={10000} required />
        </Field>
        <Field id={id + '-reason'} label="Staff-only reason" requirement="required">
          <Textarea id={id + '-reason'} value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={10000} required />
        </Field>
        {error && <p role="alert" className="wrap-anywhere text-destructive">{error}</p>}
        <Button type="submit" disabled={!entered || routeHolds.length > 0 || pending}>{pending ? 'Issuing…' : 'Issue award'}</Button>
      </form>
    </div>
  )
}
