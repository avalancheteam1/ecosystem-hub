'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/** `keywords`: other texts that find this option (e.g. alternative names). `matched`: already found by a server search - always shown. */
export type SearchSelectOption = { value: string; label: string; icon?: React.ReactNode; keywords?: string[]; matched?: boolean }

/**
 * Single-select dropdown with type-ahead search - for long lists (countries, time zones). Looks like `NativeSelect`.
 * `onCreate`: offers "Add “<typed text>”" when no option has exactly that label or keyword (extensible lists).
 * `onSearchChange`: the typed text, for adding server-searched options (`matched`). Pass a stable function (a state setter).
 */
export function SearchSelect({ id, value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', emptyText = 'No matches.', className, onCreate, onSearchChange, label }: {
  id?: string
  value: string | null | undefined
  onChange: (value: string) => void
  options: SearchSelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  onCreate?: (text: string) => void
  onSearchChange?: (text: string) => void
  /** Shown instead of the selected option's label (e.g. a typed-in value that has no option yet). */
  label?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => onSearchChange?.(search), [search, onSearchChange])
  const selected = options.find((o) => o.value === value)
  const typed = search.trim()
  const canCreate = !!onCreate && typed.length > 0 && !options.some((o) => [o.label, ...(o.keywords ?? [])].some((t) => t.toLowerCase() === typed.toLowerCase()))
  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setSearch('')
  }
  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          // Typing on the focused trigger opens the search with that letter, like a native <select>.
          onKeyDown={(e) => {
            if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || e.key === ' ') return
            e.preventDefault()
            setSearch((s) => s + e.key) // append: fast typing can land here again before the search input has focus
            setOpen(true)
          }}
          className={cn('flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm outline-none focus-visible:border-ring disabled:opacity-50', className)}
        >
          {selected?.icon}
          <span className={cn('min-w-0 flex-1 truncate', !selected && !label && 'text-fg-faint')}>{label ?? selected?.label ?? value ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-fg-faint" aria-hidden />
        </button>
      </PopoverTrigger>
      {/* Radix focuses with the text selected - the next key would replace the typed letter. */}
      <PopoverContent onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus() }} align="start" className="w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-lg border-line bg-surface-2 p-0">
        <Command className="bg-transparent">
          <CommandInput ref={inputRef} placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList className="p-1">
            {!canCreate && !options.some((o) => o.matched) && <CommandEmpty className="py-6 text-center text-sm text-fg-muted">{emptyText}</CommandEmpty>}
            {options.map((o) => (
              // cmdk searches `value`; include the key so "DE" or "Europe/" match too.
              <CommandItem key={o.value} value={`${o.label} ${o.value}`} keywords={o.keywords} forceMount={o.matched} onSelect={() => { onChange(o.value); changeOpen(false) }} className="min-h-10 rounded-md px-3 text-fg-body data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg-heading">
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && <Check className="size-4 text-brand" aria-hidden />}
              </CommandItem>
            ))}
            {canCreate && (
              <CommandItem forceMount value={`__create ${typed}`} onSelect={() => { onCreate(typed); changeOpen(false) }} className="min-h-10 rounded-md px-3 text-fg-body data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg-heading">
                <Plus className="size-4 text-brand" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Add “{typed}”</span>
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
