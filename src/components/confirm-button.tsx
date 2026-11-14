'use client'

import { Button } from '@/components/ui/button'

/** Destructive action behind a native confirm. */
export function ConfirmButton({ message, onConfirm, children, disabled, size = 'sm', title }: { message: string; onConfirm: () => void; children: React.ReactNode; disabled?: boolean; size?: 'sm' | 'default'; title?: string }) {
  return (
    <Button type="button" variant="ghost" size={size} disabled={disabled} title={title} className="text-destructive hover:text-destructive" onClick={() => confirm(message) && onConfirm()}>
      {children}
    </Button>
  )
}
