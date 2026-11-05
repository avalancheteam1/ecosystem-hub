'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { PASSKEY_NAME_MAX } from '@/lib/second-factor'
import { ConfirmButton } from '@/components/confirm-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthCall } from './use-auth-call'

export type PasskeyRow = { id: string; label: string; added: string }

/** Passkeys: add (browser/OS dialog), rename, remove. Default labels (authenticator name) are resolved on the server. */
export function PasskeysCard({ passkeys }: { passkeys: PasskeyRow[] }) {
  const { pending, call } = useAuthCall()
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  return (
    <div className="space-y-4">
      {passkeys.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {passkeys.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              {editing?.id === p.id ? (
                <form
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (await call(() => authClient.passkey.updatePasskey({ id: p.id, name: editing.name.trim() }), 'Passkey renamed')) setEditing(null)
                  }}
                >
                  <Input aria-label="Passkey name" autoFocus required maxLength={PASSKEY_NAME_MAX} value={editing.name} onChange={(e) => setEditing({ id: p.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null) }} className="h-11 min-w-0 flex-1" />
                  <Button type="submit" disabled={pending || !editing.name.trim()}>Save</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </form>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-3">
                    <KeyRound className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg-heading">{p.label}</span>
                      <span className="block text-xs text-fg-faint">Added {p.added}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditing({ id: p.id, name: p.label })}>Rename</Button>
                    <ConfirmButton message={`Remove the passkey "${p.label}"? You can't sign in with it anymore, and you're signed out on all other devices.`} disabled={pending} onConfirm={() => call(() => authClient.passkey.deletePasskey({ id: p.id }), 'Passkey removed')}>Remove</ConfirmButton>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" disabled={pending} onClick={() => call(() => authClient.passkey.addPasskey(), 'Passkey added')}>
        <KeyRound aria-hidden /> Add a passkey
      </Button>
    </div>
  )
}
