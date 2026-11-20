'use client'

import { setProjectRequirements } from '@/app/(site)/events/_lib/hackathons/setup-actions'
import { Checkbox } from '@/components/ui/checkbox'
import { useActionToast } from '@/hooks/use-action-toast'
import { PROJECT_REQUIREMENTS, type ProjectRequirement } from '@/lib/project-requirements'

export function ProjectRequirements({ hackathonId, optional }: { hackathonId: string; optional: string[] }) {
  const { pending, run } = useActionToast()
  return <div className="grid gap-3">{Object.entries(PROJECT_REQUIREMENTS).map(([key, label]) => (
    <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{label} <span className="text-fg-muted">Required</span></span>
      <Checkbox aria-label={`${label} Required`} disabled={pending} checked={!optional.includes(key)} onCheckedChange={(checked) => run(() => setProjectRequirements({ hackathonId, optionalProjectFields: (checked ? optional.filter((k) => k !== key) : [...optional, key]) as ProjectRequirement[] }), 'Requirements saved')} />
    </label>
  ))}<p className="text-xs text-fg-muted">Applied when a team submits. Project name, short description, identity and consent remain required.</p></div>
}
