'use client'

import { useState } from 'react'
import { inviteOrganizer, removeJudge, removeOrganizer, saveJudge } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useActionToast } from '@/hooks/use-action-toast'

type Person = { id: string; email: string; userId: string | null; user: { name: string } | null }
type Judge = Person & { trackIds: string[] }
type Track = { id: string; name: string }

function PersonRow({ p, children }: { p: Person; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-fg-heading">{p.user?.name ?? p.email}</p>
        <p className="truncate text-xs text-fg-muted">{p.user ? p.email : 'Invited — joins when they sign in with this email'}</p>
      </div>
      {children}
    </li>
  )
}

export function OrganizerList({ hackathonId, organizers }: { hackathonId: string; organizers: Person[] }) {
  const [email, setEmail] = useState('')
  const { pending, run } = useActionToast()
  return (
    <>
      <ul className="divide-y divide-line">
        {organizers.map((o) => (
          <PersonRow key={o.id} p={o}>
            {organizers.length > 1 && <ConfirmButton disabled={pending} message={`Remove ${o.email} as organiser?`} onConfirm={() => run(() => removeOrganizer({ hackathonId, organizerId: o.id }), 'Organiser removed')}>Remove</ConfirmButton>}
          </PersonRow>
        ))}
      </ul>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => inviteOrganizer({ hackathonId, email }), `Invited ${email}`, () => setEmail('')) }}>
        <Input type="email" required placeholder="organiser@email.com" aria-label="Organiser email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        <Button type="submit" disabled={pending}>Invite</Button>
      </form>
    </>
  )
}

function TrackPicker({ tracks, value, onChange }: { tracks: Track[]; value: string[]; onChange: (v: string[]) => void }) {
  if (!tracks.length) return null
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm">Tracks <span className="text-fg-faint">(none ticked = all tracks)</span></legend>
      {tracks.map((t) => (
        <label key={t.id} className="flex items-center gap-3 text-sm">
          <Checkbox checked={value.includes(t.id)} onCheckedChange={(c) => onChange(c ? [...value, t.id] : value.filter((x) => x !== t.id))} /> {t.name}
        </label>
      ))}
    </fieldset>
  )
}

function JudgeDialog({ hackathonId, tracks, judge, trigger }: { hackathonId: string; tracks: Track[]; judge?: Judge; trigger: React.ReactNode }) {
  const [email, setEmail] = useState('')
  const [trackIds, setTrackIds] = useState<string[]>(judge?.trackIds ?? [])
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={trigger}
      title={judge ? `Tracks for ${judge.user?.name ?? judge.email}` : 'Invite a judge'}
      description={judge ? undefined : 'They get an email and see their review queue at /judge after signing in with this address.'}
      submitLabel={judge ? 'Save' : 'Send invite'}
      pending={pending}
      onOpenChange={(o) => o && (setEmail(''), setTrackIds(judge?.trackIds ?? []))}
      onSubmit={() => run(() => saveJudge({ hackathonId, judgeId: judge?.id, email: judge ? undefined : email, trackIds }), judge ? 'Judge updated' : `Invited ${email}`)}
    >
      {!judge && <Field id="judge-email" label="Email"><Input id="judge-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" /></Field>}
      <TrackPicker tracks={tracks} value={trackIds} onChange={setTrackIds} />
    </FormDialog>
  )
}

export function JudgeList({ hackathonId, judges, tracks }: { hackathonId: string; judges: Judge[]; tracks: Track[] }) {
  const { pending, run } = useActionToast()
  const trackName = (id: string) => tracks.find((t) => t.id === id)?.name ?? '?'
  return (
    <>
      {judges.length === 0 ? (
        <p className="text-sm text-fg-muted">No judges yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {judges.map((j) => (
            <PersonRow key={j.id} p={j}>
              <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                {j.trackIds.length ? j.trackIds.map((t) => <Badge key={t} variant="secondary">{trackName(t)}</Badge>) : tracks.length > 0 && <Badge variant="outline">All tracks</Badge>}
              </div>
              {tracks.length > 0 && <JudgeDialog hackathonId={hackathonId} tracks={tracks} judge={j} trigger={<Button size="sm" variant="ghost">Tracks</Button>} />}
              <ConfirmButton disabled={pending} message={`Remove ${j.email} as judge? Their unfinished assignments are dropped.`} onConfirm={() => run(() => removeJudge({ hackathonId, judgeId: j.id }), 'Judge removed')}>Remove</ConfirmButton>
            </PersonRow>
          ))}
        </ul>
      )}
      <div className="mt-4"><JudgeDialog hackathonId={hackathonId} tracks={tracks} trigger={<Button size="sm" variant="outline">Invite judge</Button>} /></div>
    </>
  )
}
