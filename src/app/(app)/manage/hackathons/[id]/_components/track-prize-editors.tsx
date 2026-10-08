'use client'

import { useState } from 'react'
import { deletePrize, deleteTrack, savePrize, saveTrack, setPrizePool } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { MarkdownField } from '@/components/markdown-field'
import { ImageUploadField } from '@/components/image-upload-field'
import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'

type Track = { id: string; name: string; descriptionMd: string | null; sponsor: string | null; sponsorLogoUrl: string | null }
type Prize = { id: string; trackId: string | null; placement: number; title: string; amount: string | null; description: string | null }

export function TrackDialog({ hackathonId, track, trigger }: { hackathonId: string; track?: Track; trigger: React.ReactNode }) {
  const empty = { name: track?.name ?? '', descriptionMd: track?.descriptionMd ?? '', sponsor: track?.sponsor ?? '', sponsorLogoUrl: track?.sponsorLogoUrl ?? null }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={trigger}
      title={track ? 'Edit track' : 'New track'}
      description="Tracks are themes teams enter, often with their own sponsor and prizes."
      submitLabel={track ? 'Save track' : 'Add track'}
      pending={pending}
      onOpenChange={(o) => o && setV(empty)}
      onSubmit={() => run(() => saveTrack({ hackathonId, trackId: track?.id, ...v }), track ? 'Track saved' : 'Track added')}
    >
      <Field id="track-name" label="Name"><Input id="track-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={60} className="h-11" /></Field>
      <ImageUploadField kind="sponsor-logo" ownerId={hackathonId} value={v.sponsorLogoUrl} onChange={(url) => setV({ ...v, sponsorLogoUrl: url })} label="Sponsor logo" />
      <Field id="track-sponsor" label="Sponsor (optional)"><Input id="track-sponsor" value={v.sponsor} onChange={(e) => setV({ ...v, sponsor: e.target.value })} maxLength={80} className="h-11" /></Field>
      <MarkdownField id="track-desc" label="Description" hint="What you want teams to build." value={v.descriptionMd} onChange={(t) => setV({ ...v, descriptionMd: t })} rows={6} />
    </FormDialog>
  )
}

export function DeleteTrack({ hackathonId, track }: { hackathonId: string; track: Track }) {
  const { pending, run } = useActionToast()
  return <ConfirmButton disabled={pending} message={`Delete the track "${track.name}" and its prizes?`} onConfirm={() => run(() => deleteTrack({ hackathonId, trackId: track.id }), 'Track deleted')}>Delete</ConfirmButton>
}

export function PrizeDialog({ hackathonId, tracks, prize, trigger }: { hackathonId: string; tracks: Track[]; prize?: Prize; trigger: React.ReactNode }) {
  const empty = { trackId: prize?.trackId ?? '', placement: String(prize?.placement ?? 1), title: prize?.title ?? '', amount: prize?.amount ?? '', description: prize?.description ?? '' }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  return (
    <FormDialog
      trigger={trigger}
      title={prize ? 'Edit prize' : 'New prize'}
      submitLabel={prize ? 'Save prize' : 'Add prize'}
      pending={pending}
      onOpenChange={(o) => o && setV(empty)}
      onSubmit={() => run(() => savePrize({ hackathonId, prizeId: prize?.id, ...v }), prize ? 'Prize saved' : 'Prize added')}
    >
      <Field id="prize-track" label="For">
        <NativeSelect id="prize-track" value={v.trackId} onChange={(e) => setV({ ...v, trackId: e.target.value })}>
          <option value="">The whole hackathon</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-[100px_1fr] gap-4">
        <Field id="prize-place" label="Place"><Input id="prize-place" type="number" min={1} value={v.placement} onChange={(e) => setV({ ...v, placement: e.target.value })} className="h-11" /></Field>
        <Field id="prize-title" label="Title"><Input id="prize-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required maxLength={80} placeholder="1st place" className="h-11" /></Field>
      </div>
      <Field id="prize-amount" label="Amount" hint="Shown as written, e.g. $5,000 or 2,000 AVAX."><Input id="prize-amount" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} maxLength={40} className="h-11" /></Field>
      <Field id="prize-desc" label="Details (optional)"><Textarea id="prize-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={3} maxLength={500} /></Field>
    </FormDialog>
  )
}

export function DeletePrize({ hackathonId, prize }: { hackathonId: string; prize: Prize }) {
  const { pending, run } = useActionToast()
  return <ConfirmButton disabled={pending} message={`Delete the prize "${prize.title}"?`} onConfirm={() => run(() => deletePrize({ hackathonId, prizeId: prize.id }), 'Prize deleted')}>Delete</ConfirmButton>
}

/** Total prize pool — enough on its own; per-place prizes are optional detail. */
export function PrizePoolForm({ hackathonId, initial }: { hackathonId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? '')
  const { pending, run } = useActionToast()
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => setPrizePool({ hackathonId, prizePool: value }), value ? 'Prize pool saved' : 'Prize pool removed') }}>
      <label htmlFor="prize-pool" className="text-sm">Total prize pool</label>
      <div className="flex gap-2">
        <Input id="prize-pool" value={value} onChange={(e) => setValue(e.target.value)} maxLength={40} placeholder="$50,000" className="h-11" />
        <Button type="submit" variant="outline" disabled={pending || value === (initial ?? '')}>Save</Button>
      </div>
      <p className="text-xs text-fg-faint">Shown as written, e.g. $50,000 or 20,000 AVAX. Leave empty to show only per-place prizes.</p>
    </form>
  )
}
