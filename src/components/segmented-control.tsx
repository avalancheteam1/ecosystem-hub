'use client'

import { cn } from '@/lib/utils'

/** A few mutually exclusive options shown side by side - for 2–4 short choices; longer lists use `NativeSelect`. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, className }: {
  /** Accessible name of the group (the visible label is usually a `Field`). */
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex h-11 rounded-lg border border-input p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-md px-3 text-sm whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface-hover text-fg-heading shadow-xs' : 'text-fg-muted hover:text-fg-heading',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
