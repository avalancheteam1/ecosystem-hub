'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Copy-to-clipboard with the copied flash (icon → check for 2s). Toasts only on failure. */
export function CopyButton({ value, label = 'Copy', size = 'icon-sm', variant = 'ghost', className }: {
  value: string
  /** aria-label + tooltip. */
  label?: string
  size?: 'icon' | 'icon-sm'
  variant?: 'ghost' | 'outline'
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return toast.error('Couldn’t copy - select the text and copy it manually.')
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={copy} aria-label={label} title={label} className={className}>
      {copied ? <Check className="text-success" aria-hidden /> : <Copy aria-hidden />}
      <span className="sr-only" aria-live="polite">{copied ? 'Copied' : ''}</span>
    </Button>
  )
}
