'use client'

import { useState } from 'react'
import { deleteField, saveField } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { FIELD_TYPES } from '@/app/(site)/events/_lib/hackathons/rules'
import { ConfirmButton } from '@/components/confirm-button'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'

export const FIELD_TYPE_LABEL: Record<(typeof FIELD_TYPES)[number], string> = {
  short_text: 'Short answer', long_text: 'Paragraph', url: 'Link', select: 'Single choice', multi_select: 'Multiple choice', checkbox: 'Checkbox', number: 'Number',
}

type FieldRow = { id: string; label: string; help: string | null; type: string; required: boolean; options: string[]; maxLength: number | null }

function FieldDialog({ hackathonId, stageId, field, trigger }: { hackathonId: string; stageId: string | null; field?: FieldRow; trigger: React.ReactNode }) {
  const empty = { label: field?.label ?? '', help: field?.help ?? '', type: (field?.type ?? 'short_text') as (typeof FIELD_TYPES)[number], required: field?.required ?? false, options: (field?.options ?? []).join('\n'), maxLength: field?.maxLength ? String(field.maxLength) : '' }
  const [v, setV] = useState(empty)
  const { pending, run } = useActionToast()
  const hasOptions = v.type === 'select' || v.type === 'multi_select'
  const hasLength = v.type === 'short_text' || v.type === 'long_text'
  return (
    <FormDialog
      trigger={trigger}
      title={field ? 'Edit question' : 'New question'}
      submitLabel={field ? 'Save question' : 'Add question'}
      pending={pending}
      onOpenChange={(o) => o && setV(empty)}
      onSubmit={() => run(() => saveField({ hackathonId, fieldId: field?.id, stageId: stageId ?? '', ...v, options: hasOptions ? v.options.split('\n') .filter((o) => o.trim()) : [] }), field ? 'Question saved' : 'Question added')}
    >
      <Field id="q-label" label="Question"><Input id="q-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} required maxLength={200} className="h-11" /></Field>
      <Field id="q-help" label="Help text (optional)"><Input id="q-help" value={v.help} onChange={(e) => setV({ ...v, help: e.target.value })} maxLength={500} className="h-11" /></Field>
      <Field id="q-type" label="Answer type">
        <NativeSelect id="q-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as typeof v.type })}>
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_TYPE_LABEL[t]}</option>)}
        </NativeSelect>
      </Field>
      {hasOptions && (
        <Field id="q-options" label="Options" hint="One per line, at least two."><Textarea id="q-options" value={v.options} onChange={(e) => setV({ ...v, options: e.target.value })} rows={5} /></Field>
      )}
      {hasLength && (
        <Field id="q-max" label="Character limit" hint={v.type === 'short_text' ? 'Default 280' : 'Default 5000'}><Input id="q-max" type="number" min={1} value={v.maxLength} onChange={(e) => setV({ ...v, maxLength: e.target.value })} className="h-11" /></Field>
      )}
      <label className="flex items-center gap-3 text-sm"><Checkbox checked={v.required} onCheckedChange={(c) => setV({ ...v, required: c === true })} /> Required{v.type === 'checkbox' && ' (must be ticked - use for agreements)'}</label>
    </FormDialog>
  )
}

/** Ordered question list with add/edit/delete - registration questions (stageId null) or a stage's fields. */
export function FieldList({ hackathonId, stageId, fields, emptyText }: { hackathonId: string; stageId: string | null; fields: FieldRow[]; emptyText: string }) {
  const { pending, run } = useActionToast()
  return (
    <div className="space-y-3">
      {fields.length === 0 ? (
        <p className="text-sm text-fg-muted">{emptyText}</p>
      ) : (
        <ol className="divide-y divide-line">
          {fields.map((f, i) => (
            <li key={f.id} className="flex items-center gap-3 py-3">
              <span className="w-5 shrink-0 text-sm text-fg-faint">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-fg-heading">{f.label}{f.required && <span className="text-brand"> *</span>}</p>
                <p className="text-xs text-fg-muted">{FIELD_TYPE_LABEL[f.type as keyof typeof FIELD_TYPE_LABEL] ?? f.type}{f.options.length ? ` - ${f.options.join(', ')}` : ''}</p>
              </div>
              <FieldDialog hackathonId={hackathonId} stageId={stageId} field={f} trigger={<Button size="sm" variant="ghost">Edit</Button>} />
              <ConfirmButton disabled={pending} message={`Delete "${f.label}"? Answers already given stay stored but are no longer shown.`} onConfirm={() => run(() => deleteField({ hackathonId, fieldId: f.id }), 'Question deleted')}>Delete</ConfirmButton>
            </li>
          ))}
        </ol>
      )}
      <FieldDialog hackathonId={hackathonId} stageId={stageId} trigger={<Button size="sm" variant="outline">Add question</Button>} />
    </div>
  )
}

