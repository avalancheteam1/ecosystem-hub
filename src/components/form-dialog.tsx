'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

/**
 * A dialog wrapping one form. `onSubmit` returns true to close (e.g. when the
 * action succeeded). Reuse this instead of hand-rolling Dialog + form.
 */
export function FormDialog({
  trigger,
  title,
  description,
  submitLabel,
  pending,
  onSubmit,
  onOpenChange,
  children,
  wide,
}: {
  trigger: React.ReactNode
  title: string
  description?: string
  submitLabel: string
  pending?: boolean
  onSubmit: () => Promise<boolean> | boolean | void
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const change = (o: boolean) => {
    setOpen(o)
    onOpenChange?.(o)
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`max-h-[90dvh] overflow-y-auto ${wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          id={`form-${title}`}
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if ((await onSubmit()) !== false) change(false)
          }}
        >
          {children}
        </form>
        <DialogFooter>
          <Button type="submit" form={`form-${title}`} disabled={pending}>{submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
