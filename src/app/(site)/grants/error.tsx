'use client'
import { Button } from '@/components/ui/button'
export default function GrantError() {
  return (
    <div className="container-page space-y-4 py-10">
      <h2 className="text-xl">Grant data could not be loaded</h2>
      <p>Try again. If you were saving a record, inspect the latest version before retrying.</p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </div>
  )
}
