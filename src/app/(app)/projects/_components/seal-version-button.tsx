'use client'

import { useState } from 'react'
import { Stamp } from 'lucide-react'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useActionToast } from '@/hooks/use-action-toast'
import { sealVersion } from '../_lib/actions'

export function SealVersionButton({ projectId, number }: { projectId: string; number: number }) {
  const [note, setNote] = useState('')
  const { run, pending } = useActionToast()
  return (
    <FormDialog
      trigger={<Button variant="outline" size="sm" className="mb-4"><Stamp aria-hidden /> Save as version {number}</Button>}
      title={`Save version ${number}`}
      description="Seals your current draft. It never changes again; your next edit starts a new draft."
      submitLabel="Save version"
      pending={pending}
      onOpenChange={(o) => o && setNote('')}
      onSubmit={() => run(() => sealVersion({ projectId, note }), `Version ${number} saved`)}
    >
      <Field id="seal-note" label="What changed?" required>
        <Input id="seal-note" value={note} onChange={(e) => setNote(e.target.value)} required maxLength={200} placeholder="e.g. Added mainnet deploy" className="h-11" />
      </Field>
    </FormDialog>
  )
}
