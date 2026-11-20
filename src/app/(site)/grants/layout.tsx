import type { ReactNode } from 'react'
import { GrantsOverview } from './_components/overview-shell'

export default function GrantsLayout({ children }: { children: ReactNode }) {
  return <GrantsOverview>{children}</GrantsOverview>
}
