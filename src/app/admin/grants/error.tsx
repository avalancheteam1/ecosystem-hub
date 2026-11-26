'use client'
import { Button } from '@/components/ui/button'
export default function GrantReviewError() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl">Grant records could not be loaded</h2>
      <p>Try again. Check the latest record before repeating a save.</p>
      <Button onClick={() => window.location.reload()}>Try again</Button>
    </div>
  )
}
