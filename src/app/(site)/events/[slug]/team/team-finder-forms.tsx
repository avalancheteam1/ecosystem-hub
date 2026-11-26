'use client'

import { useState } from 'react'
import { ChipToggle } from '@/components/chip-toggle'
import { Field } from '@/components/field'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'
import { inviteSeeker, setLookingForTeam } from '../../_lib/hackathons/team-actions'
import { SEEKER_NOTE_MAX } from '../../_lib/hackathons/team-finder'

/** "I'm looking for a team": note + tracks of interest, or switch it off. */
export function LookingForm({ hackathonId, tracks, initial }: { hackathonId: string; tracks: { id: string; name: string }[]; initial: { note: string; trackIds: string[] } | null }) {
  const [note, setNote] = useState(initial?.note ?? '')
  const [trackIds, setTrackIds] = useState(initial?.trackIds ?? [])
  const { pending, run } = useActionToast()
  const save = (looking: boolean) => run(() => setLookingForTeam({ hackathonId, looking, note, trackIds }), looking ? (initial ? 'Saved' : 'You’re on the list') : 'You’re off the list')
  return (
    <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); save(true) }}>
      <Field id="seeker-note" label="A short note" hint={`What you can do and what you'd like to build. Shown to other participants with your name, roles and skills - never your email. ${SEEKER_NOTE_MAX} characters max.`}>
        <Textarea id="seeker-note" value={note} maxLength={SEEKER_NOTE_MAX} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="Frontend dev, free evenings, keen on the DeFi track." />
      </Field>
      {tracks.length > 0 && (
        <Field id="seeker-tracks" label="Tracks you're interested in" hint="None picked = open to any track.">
          <ChipToggle label="Tracks you're interested in" options={tracks.map((t) => ({ value: t.id, label: t.name }))} value={trackIds} onChange={setTrackIds} />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{initial ? 'Save' : 'I’m looking for a team'}</Button>
        {initial && <Button type="button" variant="outline" disabled={pending} onClick={() => save(false)}>I found a team - take me off the list</Button>}
      </div>
    </form>
  )
}

/** Invite one builder from the list to a project I own (as writer). */
export function InviteSeekerButton({ hackathonId, userId, name, projects }: { hackathonId: string; userId: string; name: string; projects: { id: string; name: string; state: 'open' | 'invited' | 'member' }[] }) {
  const open = projects.filter((p) => p.state === 'open')
  const [projectId, setProjectId] = useState(open[0]?.id ?? '')
  const { pending, run } = useActionToast()
  if (!open.length) return <p className="text-sm text-fg-muted">{projects.some((p) => p.state === 'member') ? 'On your team' : 'Invited'}</p>
  return (
    <div className="flex flex-wrap items-center gap-2">
      {open.length > 1 && (
        <NativeSelect aria-label={`Project to invite ${name} to`} value={projectId} onChange={(e) => setProjectId(e.target.value)} className="h-11 max-w-56">
          {open.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      )}
      <Button size="sm" className="min-h-11" disabled={pending || !projectId} onClick={() => run(() => inviteSeeker({ hackathonId, projectId, userId }), `Invite sent to ${name}`)}>
        Invite{open.length === 1 ? ` to ${open[0]!.name}` : ''}
      </Button>
    </div>
  )
}
