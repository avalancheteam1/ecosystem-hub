import { notFound } from 'next/navigation'
import { Plus, Trophy } from 'lucide-react'
import { getManagedHackathon } from '@/app/(site)/events/_lib/hackathons/queries'
import { SectionCard } from '@/components/section-card'
import { Button } from '@/components/ui/button'
import { requireUser } from '@/lib/guards'
import { DeletePrize, DeleteTrack, PrizeDialog, PrizePoolForm, TrackDialog } from '../_components/track-prize-editors'

export const metadata = { title: 'Tracks & prizes' }

export default async function TracksPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const h = await getManagedHackathon((await params).id, user)
  if (!h) notFound()
  const groups = [{ id: null as string | null, name: 'Overall' }, ...h.tracks.map((t) => ({ id: t.id as string | null, name: t.name }))]
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <SectionCard title="Tracks" description="Optional. Teams pick one or more when they submit." actions={<TrackDialog hackathonId={h.id} trigger={<Button size="sm" variant="outline"><Plus aria-hidden /> Track</Button>} />}>
        {h.tracks.length === 0 ? (
          <p className="text-sm text-fg-muted">No tracks - everyone competes in one pool.</p>
        ) : (
          <ul className="divide-y divide-line">
            {h.tracks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-fg-heading">{t.name}</p>
                  {t.sponsor && <p className="text-sm text-fg-muted">by {t.sponsor}</p>}
                </div>
                <div className="flex shrink-0">
                  <TrackDialog hackathonId={h.id} track={t} trigger={<Button size="sm" variant="ghost">Edit</Button>} />
                  <DeleteTrack hackathonId={h.id} track={t} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Prizes" description="Set a total pool, per-place prizes, or both. Awarded after the last stage closes." actions={<PrizeDialog hackathonId={h.id} tracks={h.tracks} trigger={<Button size="sm" variant="outline"><Plus aria-hidden /> Prize</Button>} />}>
        <div className="mb-6 border-b border-line pb-6"><PrizePoolForm hackathonId={h.id} initial={h.prizePool} /></div>
        {h.prizes.length === 0 ? (
          <p className="text-sm text-fg-muted">No per-place prizes.</p>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => {
              const prizes = h.prizes.filter((p) => p.trackId === g.id)
              if (!prizes.length) return null
              return (
                <div key={g.id ?? 'overall'}>
                  <h3 className="mb-2 text-sm text-fg-muted">{g.name}</h3>
                  <ul className="divide-y divide-line">
                    {prizes.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-3">
                        <Trophy className="size-4 shrink-0 text-brand" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-fg-heading">{p.title}{p.amount && <span className="text-fg-muted"> - {p.amount}</span>}</p>
                        </div>
                        <PrizeDialog hackathonId={h.id} tracks={h.tracks} prize={p} trigger={<Button size="sm" variant="ghost">Edit</Button>} />
                        <DeletePrize hackathonId={h.id} prize={p} />
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
