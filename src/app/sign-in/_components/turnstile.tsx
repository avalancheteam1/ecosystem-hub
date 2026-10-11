'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'

// Minimal Cloudflare Turnstile widget (explicit render). Tokens are single-use:
// the parent bumps `resetKey` after each request to get a fresh one. `onToken` must be
// stable (a state setter) - the widget keeps the first one it renders with.
// ponytail: no npm wrapper - the API is three calls.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

export function Turnstile({ siteKey, nonce, resetKey, onToken }: { siteKey: string; nonce?: string; resetKey: number; onToken: (token: string | null) => void }) {
  const el = useRef<HTMLDivElement>(null)

  function render() {
    if (!el.current || !window.turnstile || el.current.dataset.widgetId) return
    el.current.dataset.widgetId = window.turnstile.render(el.current, {
      sitekey: siteKey,
      theme: 'auto',
      size: 'flexible',
      callback: (t: string) => onToken(t),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    })
  }

  // (Re)render on mount and on every reset; the script may already be loaded from an earlier mount.
  useEffect(() => {
    const node = el.current
    onToken(null)
    render()
    return () => {
      if (node?.dataset.widgetId) window.turnstile?.remove(node.dataset.widgetId)
      if (node) delete node.dataset.widgetId
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, siteKey])

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} onReady={render} />
      <div ref={el} className="min-h-[65px]" />
    </>
  )
}
