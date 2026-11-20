'use client'

import { useState } from 'react'
import { collectFieldErrors, type FormIssue } from '@/lib/form-errors'

type Schema = { safeParse: (input: unknown) => { success: true } | { success: false; error: { issues: FormIssue[] } } }

/** Local field feedback; server actions still validate and authorize every write. */
export function useFormErrors(fields: Record<string, string>) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const focus = (id: string) => {
    const element = document.getElementById(id)
    const control = element?.matches('input, textarea, select, button') ? element : element?.querySelector<HTMLElement>('input, textarea, select, button')
    control?.focus()
  }
  const validate = (schema: Schema, input: unknown) => {
    const parsed = schema.safeParse(input)
    const next = parsed.success ? {} : collectFieldErrors(parsed.error.issues, fields)
    setErrors(next)
    // The field map follows visual/DOM order, rather than Zod's refinement order.
    const first = Object.keys(fields).find((key) => next[key])
    if (first) focus(fields[first]!)
    return parsed.success
  }
  return {
    errors, validate,
    reset: () => setErrors({}),
    fail: (message: string, field = 'form') => { setErrors({ [field]: message }); if (fields[field]) focus(fields[field]!) },
    props: (key: string) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${fields[key]}-error` : undefined }),
  }
}
