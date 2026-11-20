'use client'

import { useState } from 'react'
import { useFormErrors } from '@/hooks/use-form-errors'
import { sponsorPrizeSchema } from '@/app/(site)/events/_lib/hackathons/schemas'
import { saveSponsorPrize, deleteSponsorPrize } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { ConfirmButton } from '@/components/confirm-button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'

type SponsorPrize = { id: string; sponsor: string; name: string; description: string | null; eligibilityHint: string | null }
export function SponsorPrizeDialog({ hackathonId, prize, trigger }: { hackathonId: string; prize?: SponsorPrize; trigger: React.ReactNode }) {
  const empty = { sponsor: prize?.sponsor ?? '', name: prize?.name ?? '', description: prize?.description ?? '', eligibilityHint: prize?.eligibilityHint ?? '' }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  const validation = useFormErrors({ sponsor: 'sp-sponsor', name: 'sp-name', description: 'sp-description', eligibilityHint: 'sp-hint' })
  return <FormDialog noValidate trigger={trigger} title={prize ? 'Edit sponsor prize' : 'New sponsor prize'} submitLabel="Save sponsor prize" pending={pending} onOpenChange={(open) => { if (open) { setV(empty); validation.reset() } }} onSubmit={() => {
        const input = { hackathonId, sponsorPrizeId: prize?.id, ...v }
        if (!validation.validate(sponsorPrizeSchema, input)) return false
        return run(async () => {
          const result = await saveSponsorPrize(input)
          if (!result.ok) validation.fail(`${result.error} Check the latest settings and try again.`)
          return result
        }, 'Sponsor prize saved')
      }}>
    {validation.errors.form && <p role="alert" className="text-sm text-destructive">{validation.errors.form}</p>}
    <Field error={validation.errors.sponsor} id="sp-sponsor" label="Sponsor" required><Input className="h-11" {...validation.props('sponsor')} id="sp-sponsor" value={v.sponsor} onChange={(e) => setV({ ...v, sponsor: e.target.value })} required maxLength={80} /></Field>
    <Field error={validation.errors.name} id="sp-name" label="Prize name" required><Input className="h-11" {...validation.props('name')} id="sp-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={80} /></Field>
    <Field error={validation.errors.description} id="sp-description" label="Description (Optional)"><Textarea {...validation.props('description')} id="sp-description" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} /></Field>
    <Field error={validation.errors.eligibilityHint} id="sp-hint" label="Eligibility hint (Optional)" hint="Informational only. Eligibility is not automatically verified."><Textarea {...validation.props('eligibilityHint')} id="sp-hint" value={v.eligibilityHint} onChange={(e) => setV({ ...v, eligibilityHint: e.target.value })} maxLength={500} /></Field>
  </FormDialog>
}
export function DeleteSponsorPrize({ hackathonId, prize }: { hackathonId: string; prize: SponsorPrize }) {
  const { pending, run } = useActionToast()
  return <ConfirmButton size="default" disabled={pending} message={`Delete sponsor prize "${prize.name}"?`} onConfirm={() => run(() => deleteSponsorPrize({ hackathonId, sponsorPrizeId: prize.id }), 'Sponsor prize deleted')}>Delete</ConfirmButton>
}
