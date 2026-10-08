import { Label } from '@/components/ui/label'

/** Label + control + hint, the standard form row. */
export function Field({ id, label, hint, children, className }: { id: string; label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-fg-faint">{hint}</p>}
    </div>
  )
}
