'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Keep focus in step with the owner view, including browser history navigation. */
export function ReceiptFocus({ editing, children }: { editing: boolean; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const wasEditing = useRef(false)

  useEffect(() => {
    if (wasEditing.current === editing) return
    wasEditing.current = editing

    const view = root.current
    const target = editing
      ? view?.querySelector<HTMLElement>('#edit-submission textarea:not(:disabled)') ?? view?.querySelector<HTMLElement>('#edit-submission')
      : view?.querySelector<HTMLElement>('#edit-submission-link')
    const destination = target ?? view?.querySelector<HTMLElement>('#submission-history')
    destination?.focus()
  }, [editing])

  return <div ref={root} className="container-page max-w-4xl py-10">{children}</div>
}
