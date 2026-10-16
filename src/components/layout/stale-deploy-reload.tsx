'use client'

import { useEffect } from 'react'
import { unstable_isUnrecognizedActionError } from 'next/navigation'

// A tab opened before a deploy still holds the old build. Navigations reload on
// their own (deploymentId, see Dockerfile), but a server action call or a lazy
// chunk load from that tab fails. Both are fixed by loading the new build.
export function isStaleDeployError(error: unknown) {
  if (unstable_isUnrecognizedActionError(error)) return true
  const e = error as { name?: string; message?: string } | null
  return e?.name === 'ChunkLoadError' || /Failed to (load|fetch dynamically imported) (chunk|module)/i.test(e?.message ?? '')
}

/** Reloads the page for a stale-deploy error. At most once a minute, so a real bug can't loop. Returns whether it reloaded. */
export function reloadIfStale(error: unknown) {
  if (!isStaleDeployError(error)) return false
  try {
    const last = Number(sessionStorage.getItem('stale-reload') ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem('stale-reload', String(Date.now()))
  } catch {}
  window.location.reload()
  return true
}

/** Catches stale-deploy errors that never reach an error boundary (actions awaited in plain event handlers). */
export function StaleDeployReload() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reloadIfStale(e.error)
    const onRejection = (e: PromiseRejectionEvent) => reloadIfStale(e.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
