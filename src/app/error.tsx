'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { reloadIfStale } from '@/components/layout/stale-deploy-reload'
import { Button } from '@/components/ui/button'
import { captureClientError } from '@/lib/monitoring-client'

// Route-level error boundary: on-brand, never shows the stack. The error is in
// the server log (Railway) and `digest` lets you find it there.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (reloadIfStale(error)) return
    console.error(error)
    captureClientError(error)
  }, [error])
  return (
    <main className="hero-glow flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      {/* A stuck snowball, rocking in place. */}
      <svg aria-hidden viewBox="0 0 120 100" className="h-24 w-auto">
        <ellipse cx="60" cy="92" rx="38" ry="5" className="fill-fg-faint/30" />
        <g className="origin-[60px_90px] animate-wobble">
          <circle cx="60" cy="50" r="40" className="fill-snow" />
          <path d="M34 38c6-8 14-12 22-12M70 70c8-2 14-8 16-16M40 66c4 4 8 6 12 6" className="fill-none stroke-fg-faint" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </svg>
      <h1 className="text-3xl sm:text-4xl">The Snowball stalled.</h1>
      <p className="max-w-md text-fg-muted">
        Snowball is how Avalanche reaches consensus. This time it didn&apos;t roll.
      </p>
      <p className="max-w-md text-fg-muted">
        Try again in a moment. If it keeps happening, let us know{error.digest ? <> and mention <code className="text-fg-body">{error.digest}</code></> : null}.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline"><Link href="/">Back to the Ecosystem Hub</Link></Button>
      </div>
    </main>
  )
}
