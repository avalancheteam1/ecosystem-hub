'use client'

import { useEffect, useRef } from 'react'

export function ApplicantReceipt({ recorded, children }: { recorded: boolean; children: string }) {
  const wasRecorded = useRef(recorded)
  const message = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const justRecorded = recorded && !wasRecorded.current
    wasRecorded.current = recorded
    if (!justRecorded) return
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === document.body) message.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [recorded])

  return (
    <div role="status">
      {recorded && <p ref={message} tabIndex={-1} className="text-sm text-success">{children}</p>}
    </div>
  )
}
