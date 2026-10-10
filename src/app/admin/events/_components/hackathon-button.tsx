'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { createHackathon } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { useActionToast } from '@/hooks/use-action-toast'
import { DateTimeInput, toUtcIso } from '@/components/date-time-input'
import { TimeZoneSelect } from '@/components/time-zone-select'
import { canonicalTimeZone, utcToZoned } from '@/lib/timezones'

/** Turn an event into a hackathon - the submission window is required up front. */
export function HackathonButton({ eventId, hackathonId, eventStart, eventEnd, eventTimezone }: { eventId: string; hackathonId: string | null; eventStart: Date; eventEnd: Date | null; eventTimezone: string }) {
  const router = useRouter()
  const [opensAt, setOpens] = useState('')
  const [closesAt, setCloses] = useState('')
  const [tz, setTz] = useState(canonicalTimeZone(eventTimezone))
  const { pending, run } = useActionToast()
  if (hackathonId) {
    return <Button asChild><Link href={`/manage/hackathons/${hackathonId}`}><Trophy aria-hidden /> Manage hackathon</Link></Button>
  }
  return (
    <FormDialog
      trigger={<Button><Trophy aria-hidden /> Set up as hackathon</Button>}
      title="Set up as hackathon"
      description="When can teams submit their projects? You can add more rounds later."
      submitLabel="Create hackathon"
      pending={pending}
      onOpenChange={(o) => {
        if (!o) return
        const zone = canonicalTimeZone(eventTimezone)
        setTz(zone)
        setOpens(utcToZoned(eventStart, zone))
        setCloses(eventEnd ? utcToZoned(eventEnd, zone) : '')
      }}
      onSubmit={() =>
        run(async () => {
          const res = await createHackathon({ eventId, opensAt: toUtcIso(opensAt, tz), closesAt: toUtcIso(closesAt, tz), timezone: tz })
          if (res.ok) router.push(`/manage/hackathons/${res.data.id}`)
          return res
        }, 'Hackathon created - set it up next')
      }
    >
      <Field id="h-tz" label="Timezone" hint="Times below are in this zone; deadlines are shown in it on the public page. Starts as the Luma event's zone.">
        <TimeZoneSelect id="h-tz" value={tz} onChange={setTz} />
      </Field>
      <Field id="h-open" label="Submissions open"><DateTimeInput id="h-open" required value={opensAt} onChange={setOpens} timeZone={tz} /></Field>
      <Field id="h-close" label="Submission deadline"><DateTimeInput id="h-close" required value={closesAt} onChange={setCloses} timeZone={tz} /></Field>
    </FormDialog>
  )
}
