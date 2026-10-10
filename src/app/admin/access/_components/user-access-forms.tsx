'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { setSuperAdmin, setUserPermissions, setUserRoles } from '../_lib/actions'
import { PermissionPicker } from './permission-picker'

function useSave() {
  const [pending, start] = useTransition()
  const save = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const res = await fn()
      if (res.ok) toast.success(msg)
      else toast.error(res.error ?? 'Something went wrong')
    })
  return { pending, save }
}

export function SuperAdminSwitch({ userId, value, envLocked, isSelf }: { userId: string; value: boolean; envLocked: boolean; isSelf: boolean }) {
  const { pending, save } = useSave()
  return (
    <div className="flex items-center gap-3">
      <Switch
        id="super-admin"
        checked={value || envLocked}
        disabled={pending || envLocked || (isSelf && value)}
        onCheckedChange={(v) => save(() => setSuperAdmin({ userId, value: v }), v ? 'Now a super admin' : 'Super admin removed')}
      />
      <label htmlFor="super-admin" className="text-sm">
        Super admin
        {envLocked && <span className="block text-xs text-fg-muted">Via SUPER_ADMIN_EMAILS - change it in the deployment env.</span>}
        {isSelf && value && !envLocked && <span className="block text-xs text-fg-muted">You can&apos;t remove your own access.</span>}
      </label>
    </div>
  )
}

export function UserRolesForm({ userId, roles, initial }: { userId: string; roles: { id: string; label: string; slug: string }[]; initial: string[] }) {
  const [value, setValue] = useState(initial)
  const { pending, save } = useSave()
  if (roles.length === 0) return <p className="text-sm text-fg-muted">No roles defined yet.</p>
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(() => setUserRoles({ userId, roleIds: value }), 'Roles saved') }}>
      <ul className="space-y-2">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <Checkbox id={`ur-${r.id}`} checked={value.includes(r.id)} onCheckedChange={(c) => setValue(c ? [...value, r.id] : value.filter((id) => id !== r.id))} />
            <label htmlFor={`ur-${r.id}`} className="text-sm">{r.label} <code className="text-xs text-fg-faint">{r.slug}</code></label>
          </li>
        ))}
      </ul>
      <Button type="submit" size="sm" disabled={pending}>Save roles</Button>
    </form>
  )
}

export function UserGrantsForm({ userId, initial, viaRoles }: { userId: string; initial: string[]; viaRoles: string[] }) {
  const [value, setValue] = useState(initial)
  const { pending, save } = useSave()
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(() => setUserPermissions({ userId, permissions: value }), 'Permissions saved') }}>
      <PermissionPicker idPrefix="grant" value={value} onChange={setValue} locked={viaRoles.filter((k) => !value.includes(k))} />
      <Button type="submit" size="sm" disabled={pending}>Save direct permissions</Button>
    </form>
  )
}
