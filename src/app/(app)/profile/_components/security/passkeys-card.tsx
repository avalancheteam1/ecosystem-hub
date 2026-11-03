'use client'

import { KeyRound } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { ConfirmButton } from '@/components/confirm-button'
import { Button } from '@/components/ui/button'
import { useAuthCall } from './use-auth-call'

export type PasskeyRow = { id: string; label: string; added: string }

/** Passkeys: add (browser/OS dialog), remove. Labels are resolved on the server. */
export function PasskeysCard({ passkeys }: { passkeys: PasskeyRow[] }) {
  const { pending, call } = useAuthCall()
  return (
    <div className="space-y-4">
      {passkeys.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {passkeys.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
              <span className="flex min-w-0 items-center gap-3">
                <KeyRound className="size-4 shrink-0 text-fg-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-fg-heading">{p.label}</span>
                  <span className="block text-xs text-fg-faint">Added {p.added}</span>
                </span>
              </span>
              <ConfirmButton message={`Remove the passkey "${p.label}"? You can't sign in with it anymore, and you're signed out on all other devices.`} disabled={pending} onConfirm={() => call(() => authClient.passkey.deletePasskey({ id: p.id }), 'Passkey removed')}>Remove</ConfirmButton>
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
