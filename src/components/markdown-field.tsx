'use client'

import { useState } from 'react'
import { Markdown } from '@/components/markdown'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/** Markdown textarea with Write / Preview - use for every Markdown field. */
export function MarkdownField({ id, label, hint, value, onChange, rows = 8, maxLength, placeholder, required }: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  rows?: number
  maxLength?: number
  placeholder?: string
  required?: boolean
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <div role="tablist" aria-label={`${label} editor`} className="flex rounded-lg border border-line p-0.5 text-xs">
          {(['write', 'preview'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('min-h-7 rounded-md px-3 capitalize transition-colors', tab === t ? 'bg-surface-hover text-fg-heading' : 'text-fg-muted hover:text-fg-heading')}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'write' ? (
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} maxLength={maxLength} placeholder={placeholder} required={required} className="font-mono text-[13px] leading-relaxed" />
      ) : (
        <div className="min-h-32 rounded-lg border border-line bg-surface-1 p-4" style={{ minHeight: `${rows * 1.6}rem` }}>
          {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-fg-faint">Nothing to preview yet.</p>}
        </div>
      )}
      <p className="text-xs text-fg-faint">{hint ? `${hint} ` : ''}Markdown: **bold**, *italic*, [link](https://…), - lists, ## headings.</p>
    </div>
  )
}
