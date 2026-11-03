'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type AuthResult<T> = { data: T | null; error: { message?: string; code?: string } | null }

// Better Auth's "fresh session" check (email change, turning off the app) answers with this code.
const STALE = 'SESSION_NOT_FRESH'

/** useActionToast for Better Auth client calls ({ data, error } instead of { ok }). Resolves data or null. */
export function useAuthCall() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  async function call<T>(fn: () => Promise<AuthResult<T>>, success?: string): Promise<T | null> {
    setPending(true)
    const { data, error } = await fn().finally(() => setPending(false))
    if (error) {
      toast.error(error.code === STALE ? 'For this, sign out and sign in again first (your sign-in is older than a day).' : (error.message ?? 'Something went wrong'))
      return null
    }
    if (success) {
      toast.success(success)
      router.refresh()
    }
    return data
  }
  return { pending, call }
}
