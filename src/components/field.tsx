import { Label } from '@/components/ui/label'

/** Label + control + hint, the standard form row. */
export function Field({ id, label, hint, error, required, children, className }: { id: string; label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}{required && <span aria-hidden className="text-destructive">*</span>}</Label>
      {children}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
      {hint && <p className="text-xs text-fg-faint">{hint}</p>}
    </div>
  )
}
