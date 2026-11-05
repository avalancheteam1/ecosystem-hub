'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Prove the second factor for this session: passkey, authenticator code or a backup code. */
export function VerifyForm({ passkey, totp }: { passkey: boolean; totp: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<'totp' | 'backup'>('totp')
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<{ error: { message?: string } | null }>) {
    setPending(true)
    setError(null)
    const { error } = await fn()
    setPending(false)
    if (error) setError(error.message ?? 'That didn’t work - try again.')
    else router.refresh() // the page forwards to where you were going
  }

  return (
    <div className="mt-6 space-y-6">
      {passkey && (
        <Button type="button" className="w-full" disabled={pending} onClick={() => run(() => authClient.signIn.passkey())}>
          <KeyRound aria-hidden /> Use your passkey
        </Button>
      )}
      {passkey && totp && (
        <div className="flex items-center gap-3 text-xs text-fg-faint">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
      )}
      {totp && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => (mode === 'totp' ? authClient.twoFactor.verifyTotp({ code }) : authClient.twoFactor.verifyBackupCode({ code })))
          }}
        >
          <Label htmlFor="code">{mode === 'totp' ? 'Code from your authenticator app' : 'One of your backup codes'}</Label>
          {mode === 'totp' ? (
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="h-11 text-center text-lg tracking-[0.5em]" />
          ) : (
            <Input id="code" autoComplete="off" required autoFocus value={code} onChange={(e) => setCode(e.target.value.trim())} className="h-11 text-center font-mono" />
          )}
          <Button type="submit" variant={passkey ? 'outline' : 'default'} className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Continue
          </Button>
          <button type="button" className="min-h-11 w-full text-sm text-fg-muted hover:text-fg-heading" onClick={() => { setMode(mode === 'totp' ? 'backup' : 'totp'); setCode('') }}>
            {mode === 'totp' ? 'Lost your phone? Use a backup code' : 'Use the authenticator app'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="border-t border-line pt-4 text-center text-xs text-fg-faint">
        Lost access to all of them? Ask a team1 super admin to reset your sign-in step.{' '}
        <button type="button" className="underline underline-offset-2 hover:text-fg-heading" onClick={() => authClient.signOut().then(() => router.push('/'))}>Sign out</button>
      </div>
    </div>
  )
}
