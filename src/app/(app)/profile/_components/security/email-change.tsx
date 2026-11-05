'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Field } from '@/components/field'
import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthCall } from './use-auth-call'

type Step = 'idle' | 'enter' | 'current' | 'new'

const codeInput = { inputMode: 'numeric' as const, autoComplete: 'one-time-code', pattern: '[0-9]{6}', maxLength: 6, required: true, className: 'h-11 tracking-[0.3em]' }

/** Change email: a code to the current address, then one to the new address (Better Auth email-OTP changeEmail). */
export function EmailChange({ email, turnstileSiteKey, nonce }: { email: string; turnstileSiteKey?: string; nonce?: string }) {
  const { pending, call } = useAuthCall()
  const [step, setStep] = useState<Step>('idle')
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const reset = () => { setStep('idle'); setNewEmail(''); setCode('') }

  if (step === 'idle') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-fg-body">Current email: <span className="break-all text-fg-heading">{email}</span></p>
        <Button variant="outline" onClick={() => setStep('enter')}>Change email</Button>
      </div>
    )
  }

  if (step === 'enter') {
    return (
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const headers = captchaToken ? { 'x-captcha-response': captchaToken } : undefined
          const ok = await call(() => authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification', fetchOptions: { headers } }))
          setCaptchaReset((n) => n + 1) // tokens are single-use
          if (ok) setStep('current')
        }}
      >
        <p className="text-sm text-fg-body">Change your email from <span className="break-all text-fg-heading">{email}</span> to:</p>
        <Field id="new-email" label="New email address" hint="We send a code to your current address first, then one to the new address.">
          <Input id="new-email" type="email" autoComplete="email" required autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value.trim())} className="h-11" />
        </Field>
        {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} nonce={nonce} resetKey={captchaReset} onToken={setCaptchaToken} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !newEmail || newEmail.toLowerCase() === email.toLowerCase() || (!!turnstileSiteKey && !captchaToken)}>Send code</Button>
          <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
        </div>
      </form>
    )
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (step === 'current') {
          if (await call(() => authClient.emailOtp.requestEmailChange({ newEmail, otp: code }))) { setStep('new'); setCode('') }
        } else if (await call(() => authClient.emailOtp.changeEmail({ newEmail, otp: code }), `Your email is now ${newEmail}`)) reset()
      }}
    >
      <Field
        id="email-code"
        label={step === 'current' ? `Code sent to ${email}` : `Code sent to ${newEmail}`}
        hint={step === 'current' ? 'Step 1 of 2: confirm it’s you.' : 'Step 2 of 2: confirm the new address. No email? It may already belong to another account.'}
      >
        <Input id="email-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} {...codeInput} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || code.length !== 6}>{step === 'current' ? 'Continue' : 'Confirm new email'}</Button>
        <Button type="button" variant="ghost" onClick={reset}>Cancel</Button>
      </div>
    </form>
  )
}
