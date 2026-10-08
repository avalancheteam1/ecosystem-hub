'use client'

import { useState } from 'react'
import { updateOverview } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { MarkdownField } from '@/components/markdown-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionToast } from '@/hooks/use-action-toast'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { Field } from '@/components/field'
import { TimeZoneSelect } from '@/components/time-zone-select'
import { utcToZoned } from '@/lib/timezones'

type Initial = {
  timezone: string
  tagline: string; aboutMd: string; rulesMd: string | null; termsUrl: string | null
  registrationOpensAt: Date | null; registrationClosesAt: Date | null
  teamSizeMin: number; teamSizeMax: number; maxParticipants: number | null
}

export function OverviewForm({ hackathonId, initial }: { hackathonId: string; initial: Initial }) {
  const [v, setV] = useState({
    tagline: initial.tagline, aboutMd: initial.aboutMd, rulesMd: initial.rulesMd ?? '', termsUrl: initial.termsUrl ?? '',
    // Wall-clock times in the hackathon's zone (deterministic on server and client).
    registrationOpensAt: utcToZoned(initial.registrationOpensAt, initial.timezone), registrationClosesAt: utcToZoned(initial.registrationClosesAt, initial.timezone),
    teamSizeMin: String(initial.teamSizeMin), teamSizeMax: String(initial.teamSizeMax), maxParticipants: initial.maxParticipants ? String(initial.maxParticipants) : '',
  })
  const [tz, setTz] = useState(initial.timezone)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }))
  const { pending, run } = useActionToast()
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => updateOverview({ hackathonId, ...v, timezone: tz, registrationOpensAt: toUtcIso(v.registrationOpensAt, tz), registrationClosesAt: toUtcIso(v.registrationClosesAt, tz) }), 'Saved')
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="tagline">Tagline</Label>
        <Input id="tagline" value={v.tagline} onChange={set('tagline')} maxLength={140} placeholder="Build the next consumer app on Avalanche in 48 hours" className="h-11" />
      </div>
      <MarkdownField id="about" label="About" hint="Starts as the Luma description." value={v.aboutMd} onChange={(t) => setV((p) => ({ ...p, aboutMd: t }))} rows={12} />
      <MarkdownField id="rules" label="Rules" value={v.rulesMd} onChange={(t) => setV((p) => ({ ...p, rulesMd: t }))} rows={6} placeholder="Eligibility, what counts as original work, code of conduct…" />
      <Field id="tz" label="Timezone" hint="All times of this hackathon (registration, stages) are entered in this zone and shown in it publicly. Stored as UTC.">
        <TimeZoneSelect id="tz" value={tz} onChange={setTz} />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="opens" label="Registration opens"><DateTimeInput id="opens" value={v.registrationOpensAt} onChange={(w) => setV((p) => ({ ...p, registrationOpensAt: w }))} timeZone={tz} /></Field>
        <Field id="closes" label="Registration closes"><DateTimeInput id="closes" value={v.registrationClosesAt} onChange={(w) => setV((p) => ({ ...p, registrationClosesAt: w }))} timeZone={tz} /></Field>
        <div className="space-y-2">
          <Label htmlFor="min">Smallest team</Label>
          <Input id="min" type="number" min={1} max={50} value={v.teamSizeMin} onChange={set('teamSizeMin')} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max">Largest team</Label>
          <Input id="max" type="number" min={1} max={50} value={v.teamSizeMax} onChange={set('teamSizeMax')} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cap">Participant limit</Label>
          <Input id="cap" type="number" min={1} value={v.maxParticipants} onChange={set('maxParticipants')} placeholder="No limit" className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="terms">Terms link</Label>
          <Input id="terms" type="url" value={v.termsUrl} onChange={set('termsUrl')} placeholder="https://…" className="h-11" />
          <p className="text-xs text-fg-faint">If set, builders must accept it to join.</p>
        </div>
      </div>
      <div><Button type="submit" disabled={pending}>Save overview</Button></div>
    </form>
  )
}
