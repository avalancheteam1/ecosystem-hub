import * as React from 'react'
import { cn } from '@/lib/utils'

/** Styled native <select> - accessible, mobile-friendly; use for simple option lists. */
export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn('select-chevron h-11 w-full rounded-lg border border-input bg-transparent pl-3 pr-10 text-sm outline-none focus-visible:border-ring disabled:opacity-50 [&>option]:bg-popover', className)}
      {...props}
    />
  )
}
