'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail } from 'lucide-react'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PROVIDER_LABEL = { google: 'Continue with Google', github: 'Continue with GitHub' } as const

export function SignInForm({ next, providers }: { next: string; providers: ('google' | 'github')[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<{ error: { message?: string } | null }>, onOk: () => void) {
    setPending(true)
    setError(null)
    const { error } = await fn()
    setPending(false)
    if (error) setError(error.message ?? 'Something went wrong')
    else onOk()
  }

  return (
    <div className="mt-6 space-y-6">
      {providers.length > 0 && (
        <div className="space-y-3">
          {providers.map((p) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => run(() => authClient.signIn.social({ provider: p, callbackURL: next }), () => {})}
            >
              {PROVIDER_LABEL[p]}
            </Button>
          ))}
          <div className="flex items-center gap-3 text-xs text-fg-faint">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}

      {step === 'email' ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' }), () => setStep('code'))
          }}
        >
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />} Email me a code
          </Button>
        </form>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => authClient.signIn.emailOtp({ email, otp }), () => {
              router.push(next)
              router.refresh()
            })
          }}
        >
          <Label htmlFor="otp">Code sent to {email}</Label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="h-11 text-center text-lg tracking-[0.5em]"
          />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />} Sign in
          </Button>
          <button type="button" className="w-full text-sm text-fg-muted hover:text-fg-heading" onClick={() => { setStep('email'); setOtp('') }}>
            Use a different email
          </button>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
