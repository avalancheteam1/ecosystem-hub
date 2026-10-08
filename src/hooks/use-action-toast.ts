'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type Result = { ok: true; data?: unknown } | { ok: false; error: string }

/** Run a server action with pending state, toast the outcome, refresh server data on success. */
export function useActionToast() {
  const router = useRouter()
  const [pending, start] = useTransition()
  /** Resolves true on success (FormDialog closes only then). */
  const run = (fn: () => Promise<Result>, success: string, onOk?: () => void) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        const res = await fn()
        if (!res.ok) {
          toast.error(res.error)
          return resolve(false)
        }
        toast.success(success)
        onOk?.()
        router.refresh()
        resolve(true)
      }),
    )
  return { pending, run }
}
