'use client'

import { Markdown } from '@/components/markdown'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const over = !!maxLength && value.length > maxLength
  const helpId = `${id}-markdown-help`
  return (
    <Tabs defaultValue="write">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <TabsList aria-label={`${label} editor`} className="shrink-0 border border-line group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="write" className="h-auto min-h-11 min-w-11 shrink-0">Write</TabsTrigger>
          <TabsTrigger value="preview" className="h-auto min-h-11 min-w-11 shrink-0">Preview</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="write" tabIndex={-1}>
        {/* ponytail: no native maxLength - it silently cuts off pastes; the counter turns red and the server rejects instead. */}
        <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-describedby={helpId} aria-invalid={over || undefined} placeholder={placeholder} required={required} className="font-mono text-[13px] leading-relaxed" />
      </TabsContent>
      <TabsContent value="preview" className="min-h-32 rounded-lg border border-line bg-surface-1 p-4 focus-visible:outline-2 focus-visible:outline-ring" style={{ minHeight: `${rows * 1.6}rem` }}>
        {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-fg-faint">Nothing to preview yet.</p>}
      </TabsContent>
      <div className="flex items-start justify-between gap-3">
        <p id={helpId} className="text-xs text-fg-faint">{hint ? `${hint} ` : ''}Markdown: **bold**, *italic*, [link](https://…), - lists, ## headings.</p>
        {maxLength && (
          <span aria-live="polite" className={cn('shrink-0 text-xs tabular-nums', over ? 'text-destructive' : 'text-fg-faint')}>
            {value.length.toLocaleString('en-US')}/{maxLength.toLocaleString('en-US')}{over && ' - too long'}
          </span>
        )}
      </div>
    </Tabs>
  )
}
