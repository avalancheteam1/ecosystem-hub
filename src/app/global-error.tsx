'use client'

import { useEffect } from 'react'
import { reloadIfStale } from '@/components/layout/stale-deploy-reload'

// Last-resort boundary for errors in the root layout itself. It replaces the
// whole document, so it can't rely on globals.css or fonts - inline styles only.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reloadIfStale(error)
  }, [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#0b0a0f', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
        <main>
          <h1 style={{ fontWeight: 500, color: '#fff' }}>Something went wrong.</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: '12px 20px', borderRadius: 8, border: 0, background: '#e6212f', color: '#fff', fontSize: 16, cursor: 'pointer' }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
