import { NativeSelect } from '@/components/ui/native-select'
import { Button } from '@/components/ui/button'
import type { SubmissionFilters as Filters } from '../../_lib/hackathons/feedback-rules'

export function SubmissionFilters({ tracks, sponsorPrizes, value, keep = {} }: { tracks: { id: string; name: string }[]; sponsorPrizes: { id: string; name: string }[]; value: Filters; keep?: Record<string, string | undefined> }) {
  return <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
    {Object.entries(keep).filter(([, v]) => v).map(([key, v]) => <input key={key} type="hidden" name={key} value={v} />)}
    <label className="grid min-w-0 flex-1 basis-48 gap-2 text-sm">Track<NativeSelect name="track" defaultValue={value.track ?? ''}><option value="">All tracks</option><option value="none">No track / free project</option>{tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></label>
    <label className="grid min-w-0 flex-1 basis-48 gap-2 text-sm">Sponsor prize<NativeSelect name="sponsor" defaultValue={value.sponsor ?? ''}><option value="">All sponsor prizes</option>{sponsorPrizes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label>
    <Button type="submit" variant="outline">Filter</Button>
  </form>
}
