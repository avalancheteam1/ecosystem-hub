'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** A list of single values (links, addresses): type, press Enter / Add; remove per item. */
export function ValueListInput({ id, value, onChange, placeholder, max = 10, type = 'url' }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; max?: number; type?: 'url' | 'text' }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const v = draft.trim()
    if (!v || value.some((x) => x.toLowerCase() === v.toLowerCase())) return setDraft('')
    onChange([...value, v])
    setDraft('')
  }
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((v, i) => (
            <li key={v} className="flex items-center gap-2 rounded-lg border border-line bg-surface-1 py-1 pr-1 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{v}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X aria-hidden /></Button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <div className="flex gap-2">
          <Input id={id} type={type} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} onBlur={add} className="h-11" />
          <Button type="button" variant="outline" size="icon" aria-label="Add" onClick={add}><Plus aria-hidden /></Button>
        </div>
      )}
    </div>
  )
}

/** List of { tag, url } pairs (websites, socials). */
export function TaggedLinksInput({ label, value, onChange, max = 10 }: { label: string; value: { tag: string; url: string }[]; onChange: (v: { tag: string; url: string }[]) => void; max?: number }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm">{label}</legend>
      {value.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`${label} ${i + 1} tag`} placeholder="Tag" value={l.tag} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))} className="h-11 w-32 shrink-0" />
          <Input aria-label={`${label} ${i + 1} link`} type="url" placeholder="https://example.com" value={l.url} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className="h-11" />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))}><X aria-hidden /></Button>
        </div>
      ))}
      {value.length < max && <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { tag: '', url: '' }])}><Plus aria-hidden /> Add</Button>}
    </fieldset>
  )
}

/** Free tags with suggestion chips (tech stack, skills). */
export function TagInput({ id, value, onChange, suggestions, placeholder, max = 20 }: { id: string; value: string[]; onChange: (v: string[]) => void; suggestions: readonly string[]; placeholder: string; max?: number }) {
  const [draft, setDraft] = useState('')
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase())
  const add = (t: string) => {
    const v = t.trim()
    if (v && !has(v) && value.length < max) onChange([...value, v])
    setDraft('')
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((t) => (
          <span key={t} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-brand bg-brand/10 pr-1 pl-3 text-sm text-fg-heading">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="grid size-7 place-items-center rounded-full hover:bg-brand/20"><X className="size-3.5" aria-hidden /></button>
          </span>
        ))}
        <Input id={id} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft) } }} onBlur={() => add(draft)} className="h-9 w-44 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.filter((s) => !has(s)).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className={cn('min-h-8 rounded-full border border-dashed border-line px-3 text-xs text-fg-muted transition-colors hover:border-brand hover:text-fg-heading')}>
            + {s}
          </button>
        ))}
      </div>
    </div>
  )
}
