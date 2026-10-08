'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchSelectOption = { value: string; label: string; icon?: React.ReactNode }

/** Single-select dropdown with type-ahead search — for long lists (countries, time zones). Looks like `NativeSelect`. */
export function SearchSelect({ id, value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', className }: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn('flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm outline-none focus-visible:border-ring disabled:opacity-50', className)}
        >
          {selected?.icon}
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-fg-faint')}>{selected?.label ?? value ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-fg-faint" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-lg border-line bg-surface-2 p-0">
        <Command className="bg-transparent">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="p-1">
            <CommandEmpty className="py-6 text-center text-sm text-fg-muted">No matches.</CommandEmpty>
            {options.map((o) => (
              // cmdk searches `value`; include the key so "DE" or "Europe/" match too.
              <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => { onChange(o.value); setOpen(false) }} className="min-h-10 rounded-md px-3 text-fg-body data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg-heading">
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && <Check className="size-4 text-brand" aria-hidden />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
