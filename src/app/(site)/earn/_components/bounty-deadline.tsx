'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

export function BountyDeadline({ dateTime, utc }: { dateTime: string; utc: string }) {
  // Keep the server and hydration snapshots in UTC until the browser format is available.
  const local = useSyncExternalStore(subscribe, () => {
    try {
      const formatter = new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
      return formatter.resolvedOptions().timeZone ? formatter.format(new Date(dateTime)) : null
    } catch {
      return null
    }
  }, () => null)

  return <time dateTime={dateTime}>{local ? `${local} (${utc})` : utc}</time>
}
