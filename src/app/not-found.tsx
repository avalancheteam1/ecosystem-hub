import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="hero-glow flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-[clamp(5rem,18vw,9rem)] leading-none font-medium tracking-[-0.04em] text-brand">404</p>
      <h1 className="text-2xl sm:text-3xl">This page doesn&apos;t exist.</h1>
      <p className="max-w-sm text-fg-muted">It may have moved, or you may not have access to it.</p>
      <Button asChild>
        <Link href="/">Back to the Ecosystem Hub</Link>
      </Button>
    </main>
  )
}
