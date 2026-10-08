import type { ReferralStats } from '../_lib/rules'

export function MonthBars({ perMonth }: { perMonth: ReferralStats['perMonth'] }) {
  const max = Math.max(1, ...perMonth.map((m) => m.count))
  return (
    <ol className="flex h-32 items-end gap-1" aria-label="Onboardings per month">
      {perMonth.map((m) => (
        <li key={m.month} className="flex flex-1 flex-col items-center gap-1" title={`${m.month}: ${m.count}`}>
          <span className="text-xs tabular-nums text-fg-muted">{m.count || ''}</span>
          <span className="w-full rounded-t bg-brand/70" style={{ height: `${(m.count / max) * 80}px` }} />
          <span className="text-[10px] text-fg-faint">{m.month.slice(5)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Group stats: total, per month, per referrer (name + count). Never shows referred users. */
export function GroupStats({ stats }: { stats: ReferralStats & { names: Record<string, string> } }) {
  return (
    <div className="space-y-6">
      <p><span className="text-4xl text-fg-heading tabular-nums">{stats.total}</span> <span className="text-fg-muted">{stats.total === 1 ? 'onboarding' : 'onboardings'}</span></p>
      <MonthBars perMonth={stats.perMonth} />
      {stats.perReferrer.length > 0 && (
        <ul className="divide-y divide-line">
          {stats.perReferrer.map((r) => (
            <li key={r.referrerId} className="flex min-h-11 items-center justify-between gap-3">
              <span className="truncate text-fg-body">{stats.names[r.referrerId] ?? 'Deleted user'}</span>
              <span className="tabular-nums text-fg-heading">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
