'use client'

import { ChipToggle } from '@/components/chip-toggle'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

// Renders organiser-defined questions (FormField rows). Values are keyed by
// field id; the server validates them with buildAnswersSchema.

export type AnswerField = { id: string; label: string; help: string | null; type: string; required: boolean; options: string[]; maxLength: number | null }
export type Answers = Record<string, unknown>

export function AnswerFields({ fields, value, onChange, errors = {} }: { errors?: Record<string, string | undefined>; fields: AnswerField[]; value: Answers; onChange: (v: Answers) => void }) {
  const set = (id: string, v: unknown) => onChange({ ...value, [id]: v })
  return (
    <div className="grid gap-6">
      {fields.map((f) => {
        const id = `ans-${f.id}`
        const error = errors[f.id]
        const aria = { 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-error` : undefined }
        const feedback = error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>
        const label = (
          <>
            {f.label}
            {f.required ? <span className="text-destructive"> *</span> : <span className="text-fg-muted"> (Optional)</span>}
          </>
        )
        const help = f.help && <p className="text-xs text-fg-faint">{f.help}</p>
        if (f.type === 'checkbox') {
          return (
            <div key={f.id} className="space-y-1">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox {...aria} id={id} className="mt-0.5" checked={value[f.id] === true} onCheckedChange={(c) => set(f.id, c === true)} />
                <span>{label}</span>
              </label>
              {help}
              {feedback}
            </div>
          )
        }
        if (f.type === 'multi_select') {
          const cur = (value[f.id] as string[] | undefined) ?? []
          return (
            <fieldset {...aria} id={id} key={f.id} className="space-y-2">
              <legend className="text-sm">{label}</legend>
              {help}
              <ChipToggle label={f.label} options={f.options.map((o) => ({ value: o, label: o }))} value={cur} onChange={(v) => set(f.id, v)} />
              {feedback}
            </fieldset>
          )
        }
        return (
          <div key={f.id} className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            {help}
            {f.type === 'long_text' ? (
              <Textarea {...aria} id={id} required={f.required} maxLength={f.maxLength ?? 5000} rows={5} value={(value[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />
            ) : f.type === 'select' ? (
              <NativeSelect {...aria} id={id} required={f.required} value={(value[f.id] as string) ?? ''} onChange={(e) => set(f.id, e.target.value)}>
                <option value="">Choose…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </NativeSelect>
            ) : (
              <Input
                {...aria}
                id={id}
                required={f.required}
                type={f.type === 'url' ? 'url' : f.type === 'number' ? 'number' : 'text'}
                maxLength={f.type === 'short_text' ? (f.maxLength ?? 280) : undefined}
                placeholder={f.type === 'url' ? 'https://…' : undefined}
                value={(value[f.id] as string) ?? ''}
                onChange={(e) => set(f.id, e.target.value)}
                className="h-11"
              />
            )}
            {feedback}
          </div>
        )
      })}
    </div>
  )
}

/** Read-only answers (organisers/judges). */
export function AnswerList({ fields, answers }: { fields: AnswerField[]; answers: Answers }) {
  const shown = fields.filter((f) => answers[f.id] != null && answers[f.id] !== '' && !(Array.isArray(answers[f.id]) && (answers[f.id] as unknown[]).length === 0))
  if (!shown.length) return null
  return (
    <dl className="space-y-4">
      {shown.map((f) => {
        const v = answers[f.id]
        return (
          <div key={f.id}>
            <dt className="text-sm text-fg-muted">{f.label}</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-fg-body">
              {f.type === 'url' && typeof v === 'string' ? <a href={v} target="_blank" rel="noreferrer nofollow" className="underline decoration-brand underline-offset-2">{v}</a> : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
