'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRole, deleteRole, updateRole } from '../_lib/actions'
import { PermissionPicker } from './permission-picker'

export type RoleRow = { id: string; slug: string; label: string; description: string | null; permissions: string[] }

export function RoleDialog({ role, trigger }: { role?: RoleRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState(role?.slug ?? '')
  const [label, setLabel] = useState(role?.label ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? [])
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      const res = role
        ? await updateRole({ id: role.id, label, description, permissions })
        : await createRole({ slug, label, description, permissions })
      if (!res.ok) return void toast.error(res.error)
      toast.success(role ? 'Role updated' : 'Role created')
      setOpen(false)
      if (!role) {
        setSlug('')
        setLabel('')
        setDescription('')
        setPermissions([])
      }
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.label}` : 'New role'}</DialogTitle>
          <DialogDescription>A role bundles permissions. Everyone holding the role gets all of them.</DialogDescription>
        </DialogHeader>
        <form id="role-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <div className="space-y-2">
            <Label htmlFor="role-slug">Slug</Label>
            <Input id="role-slug" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!role} required placeholder="e.g. hackathon-organizer" />
            {!role && <p className="text-xs text-fg-faint">Permanent identifier — can&apos;t be changed later.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-label">Label</Label>
            <Input id="role-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-description">Description</Label>
            <Textarea id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </div>
          <PermissionPicker idPrefix="role" value={permissions} onChange={setPermissions} />
        </form>
        <DialogFooter>
          <Button type="submit" form="role-form" disabled={pending}>{role ? 'Save' : 'Create role'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteRoleButton({ role, holders }: { role: RoleRow; holders: number }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        const msg = holders > 0 ? `Delete "${role.label}"? ${holders} user(s) lose its permissions immediately.` : `Delete "${role.label}"?`
        if (!confirm(msg)) return
        start(async () => {
          const res = await deleteRole({ id: role.id })
          if (res.ok) toast.success('Role deleted')
          else toast.error(res.error)
        })
      }}
    >
      Delete
    </Button>
  )
}
