'use client'

import { AlertTriangle } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { PERMISSION_GROUPS, PERMISSIONS, type Permission } from '@/lib/permissions'

/** Checkbox list of every registry permission, grouped. `disabled` keys are shown checked and locked (e.g. held via a role). */
export function PermissionPicker({
  value,
  onChange,
  idPrefix,
  locked = [],
}: {
  value: string[]
  onChange: (next: string[]) => void
  idPrefix: string
  locked?: string[]
}) {
  return (
    <div className="space-y-5">
      {PERMISSION_GROUPS.map(({ group, keys }) => (
        <fieldset key={group}>
          <legend className="mb-2 text-sm text-fg-muted capitalize">{group}</legend>
          <ul className="space-y-2">
            {keys.map((key: Permission) => {
              const def = PERMISSIONS[key] as { label: string; sensitive?: string }
              const isLocked = locked.includes(key)
              const id = `${idPrefix}-${key}`
              return (
                <li key={key} className="flex items-start gap-3">
                  <Checkbox
                    id={id}
                    className="mt-1"
                    checked={isLocked || value.includes(key)}
                    disabled={isLocked}
                    onCheckedChange={(c) => onChange(c ? [...value, key] : value.filter((k) => k !== key))}
                  />
                  <label htmlFor={id} className="text-sm">
                    <span className="text-fg-heading">{def.label}</span> <code className="text-xs text-fg-faint">{key}</code>
                    {isLocked && <span className="ml-1 text-xs text-fg-muted">(via role)</span>}
                    {def.sensitive && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="size-3" aria-hidden /> {def.sensitive}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  )
}
