'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Route-level error boundary: on-brand, never shows the stack. The error is in
// the server log (Railway) and `digest` lets you find it there.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="hero-glow flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl sm:text-4xl">Something went wrong.</h1>
      <p className="max-w-md text-fg-muted">
        Try again in a moment. If it keeps happening, let us know{error.digest ? <> and mention <code className="text-fg-body">{error.digest}</code></> : null}.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline"><Link href="/">Back to the hub</Link></Button>
      </div>
    </main>
  )
}
