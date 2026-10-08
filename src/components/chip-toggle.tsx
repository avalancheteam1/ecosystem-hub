'use client'

import { cn } from '@/lib/utils'

/** Multi-select as toggle chips (tracks, skills, options). */
export function ChipToggle({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn('min-h-11 rounded-full border px-4 text-sm transition-colors', on ? 'border-brand bg-brand/10 text-fg-heading' : 'border-line text-fg-muted hover:border-fg-faint')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
