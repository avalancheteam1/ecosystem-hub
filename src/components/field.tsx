import { Label } from '@/components/ui/label'

export function FieldRequirement({ children }: { children: string }) {
  return <span className="font-normal text-fg-muted"> ({children})</span>
}

/** Label + control + hint, the standard form row. */
export function Field({ id, label, hint, required, requirement, children, className }: { id: string; label: string; hint?: string; required?: boolean; requirement?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}{requirement ? <FieldRequirement>{requirement}</FieldRequirement> : required && <span aria-hidden className="text-destructive">*</span>}</Label>
      {children}
      {hint && <p className="text-xs text-fg-faint">{hint}</p>}
    </div>
  )
}
