'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { API_SCOPES } from '@/lib/api-scopes'
import { createApiKey, revokeApiKey, updateApiKey } from '../_lib/actions'

export type ApiKeyRow = { id: string; name: string; scopes: string[] }

export function ApiKeyDialog({ apiKey, trigger }: { apiKey?: ApiKeyRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(apiKey?.name ?? '')
  const [scopes, setScopes] = useState<string[]>(apiKey?.scopes ?? [])
  const [created, setCreated] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () =>
    start(async () => {
      if (apiKey) {
        const res = await updateApiKey({ id: apiKey.id, name, scopes })
        if (!res.ok) return void toast.error(res.error)
        toast.success('Key updated')
        setOpen(false)
      } else {
        const res = await createApiKey({ name, scopes })
        if (!res.ok) return void toast.error(res.error)
        setCreated(res.data.key)
      }
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o && created) { setCreated(null); setName(''); setScopes([]) }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your key now</DialogTitle>
              <DialogDescription>It is shown only once. Store it in the calling service&apos;s secrets.</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input readOnly value={created} className="h-11 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="API key" />
              <CopyButton value={created} label="Copy key" variant="outline" size="icon" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{apiKey ? 'Edit API key' : 'New API key'}</DialogTitle>
              <DialogDescription>A key can do exactly what its scopes allow.</DialogDescription>
            </DialogHeader>
            <form id="api-key-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
              <div className="space-y-2">
                <Label htmlFor="key-name">Name</Label>
                <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. cascade production" />
              </div>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm">Scopes</legend>
                {Object.entries(API_SCOPES).map(([scope, label]) => (
                  <div key={scope} className="flex items-start gap-3">
                    <Checkbox id={`scope-${scope}`} className="mt-1" checked={scopes.includes(scope)} onCheckedChange={(c) => setScopes(c ? [...scopes, scope] : scopes.filter((s) => s !== scope))} />
                    <label htmlFor={`scope-${scope}`} className="text-sm"><code>{scope}</code> <span className="block text-fg-muted">{label}</span></label>
                  </div>
                ))}
              </fieldset>
            </form>
            <DialogFooter>
              <Button type="submit" form="api-key-form" disabled={pending}>{apiKey ? 'Save' : 'Create key'}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function RevokeButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Revoke "${name}"? Calls with it fail immediately. This can't be undone.`)) return
        start(async () => {
          const res = await revokeApiKey({ id })
          if (res.ok) toast.success('Key revoked')
          else toast.error(res.error)
        })
      }}
    >
      Revoke
    </Button>
  )
}
