'use client'

import { useMemo, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { buildQrSvg } from '@/lib/qr'
import { ConfirmButton } from '@/components/confirm-button'
import { CopyButton } from '@/components/copy-button'
import { Field } from '@/components/field'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthCall } from './use-auth-call'

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-heading">Backup codes</p>
        <CopyButton value={codes.join('\n')} label="Copy backup codes" />
      </div>
      <p className="mt-1 text-xs text-fg-muted">Each works once if you lose your phone. Save them somewhere safe now - they won&apos;t be shown again.</p>
      <ul className="mt-3 grid grid-cols-2 gap-1 font-mono text-sm text-fg-body">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <Button variant="outline" size="sm" className="mt-4" onClick={onDone}>I&apos;ve saved them</Button>
    </div>
  )
}

/** Authenticator app (TOTP): set up with QR + first code, new backup codes, turn off. */
export function TotpCard({ enabled }: { enabled: boolean }) {
  const { pending, call } = useAuthCall()
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState('')
  const qr = useMemo(() => (setup ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildQrSvg(setup.totpURI, { size: 200, logo: false }))}` : null), [setup])
  const secret = setup ? new URL(setup.totpURI).searchParams.get('secret') : null

  if (enabled) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone="success">On</StatusPill>
          <Button variant="outline" size="sm" disabled={pending} onClick={async () => { const d = await call(() => authClient.twoFactor.generateBackupCodes({})); if (d) setCodes(d.backupCodes) }}>New backup codes</Button>
          <ConfirmButton message="Turn off the authenticator app? Your old backup codes stop working, and you're signed out on all other devices." disabled={pending} onConfirm={() => call(() => authClient.twoFactor.disable({}), 'Authenticator app turned off')}>Turn off</ConfirmButton>
        </div>
        {codes && <BackupCodes codes={codes} onDone={() => setCodes(null)} />}
      </div>
    )
  }

  if (!setup) {
    return <Button variant="outline" disabled={pending} onClick={async () => { const d = await call(() => authClient.twoFactor.enable({})); if (d && 'totpURI' in d && d.totpURI) setSetup({ totpURI: d.totpURI, backupCodes: d.backupCodes ?? [] }) }}>Set up authenticator app</Button>
  }

  return (
    <div className="grid items-start gap-6 sm:grid-cols-[auto_1fr]">
      <div className="w-[200px] space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, not an asset */}
        {qr && <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg bg-white p-2" />}
        {secret && (
          <div>
            <p className="text-xs text-fg-muted">Can&apos;t scan? Enter this key:</p>
            <div className="flex items-center gap-1">
              <code className="min-w-0 break-all font-mono text-xs text-fg-heading">{secret}</code>
              <CopyButton value={secret} label="Copy key" />
            </div>
          </div>
        )}
      </div>
      <form
        className="min-w-0 space-y-4 text-sm text-fg-body"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await call(() => authClient.twoFactor.verifyTotp({ code }), 'Authenticator app is on')) { setCodes(setup.backupCodes); setSetup(null) }
        }}
      >
        <p>1. Scan the QR code with an authenticator app (1Password, Google Authenticator, Authy, …).</p>
        <Field id="totp-code" label="2. Enter the 6-digit code it shows">
          <Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="h-11 w-40 tracking-[0.3em]" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || code.length !== 6}>Turn on</Button>
          <Button type="button" variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
        </div>
        <p className="text-xs text-fg-faint">Next you get backup codes for when you lose your phone.</p>
      </form>
    </div>
  )
}
