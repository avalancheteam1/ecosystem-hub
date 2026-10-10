import Link from 'next/link'
import { Button } from '@/components/ui/button'

// Fixed positions, so the server render is stable. Negative delays spread the
// flakes over the screen from the first frame.
const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 5) % 100}%`,
  size: 3 + (i % 4),
  duration: `${8 + (i % 5) * 2}s`,
  delay: `${-((i * 1.3) % 12)}s`,
}))

// The 404 content. Rendered by the root not-found.tsx (wrapped in header and
// footer) and, view-only, by the not-found.tsx of every layout that already
// has the header - so the page never shows two headers.
export function NotFoundView() {
  return (
    // calc: roughly fills the screen under the header.
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col items-center justify-center gap-6 px-4 text-center">
      {/* Fixed, so glow and snow span the viewport even inside a layout's container. */}
      <div aria-hidden className="hero-glow pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {FLAKES.map((f, i) => (
          <span
            key={i}
            className="absolute -top-2 animate-snow-fall rounded-full bg-snow opacity-0"
            style={{ left: f.left, width: f.size, height: f.size, animationDuration: f.duration, animationDelay: f.delay }}
          />
        ))}
      </div>

      <div className="relative">
        <p className="text-[clamp(5rem,18vw,9rem)] leading-none font-medium tracking-[-0.04em] text-brand">404</p>
        {/* The team1 symbol, buried in the drift. Inline so its white half can follow the theme. */}
        <svg aria-hidden viewBox="0 0 151 264" className="absolute -right-[12%] bottom-[8%] h-[62%] w-auto rotate-[22deg]">
          <path className="fill-brand" d="M150.78 5.84V125.06C150.78 127.66 148.68 129.76 146.08 129.76H106.64C104.05 129.76 101.95 127.65 101.95 125.06V53.59C101.95 51 99.8501 48.89 97.2501 48.89H70.0201C67.4301 48.89 65.3301 46.78 65.3301 44.19V4.7C65.3301 2.1 67.4301 0 70.0201 0H144.94C148.16 0 150.77 2.61 150.77 5.84H150.78Z" />
          <path className="fill-fg-heading" d="M150.83 219.57V259.06C150.83 261.66 148.73 263.76 146.13 263.76H94.91C62.52 263.76 36.27 237.47 36.27 205.04V139.64C36.27 137.04 34.17 134.94 31.57 134.94H4.7C2.11 134.94 0 132.83 0 130.24V90.7501C0 88.1601 2.1 86.0501 4.7 86.0501H31.58C34.17 86.0501 36.28 83.9401 36.28 81.3501V71.0101C36.28 68.4101 38.38 66.3101 40.97 66.3101H80.41C83 66.3101 85.11 68.4201 85.11 71.0101V203.53C85.11 209.79 90.18 214.87 96.43 214.87H146.14C148.73 214.87 150.84 216.98 150.84 219.57H150.83Z" />
        </svg>
        <svg aria-hidden viewBox="0 0 400 80" preserveAspectRatio="none" className="absolute -bottom-3 -left-[20%] h-[48%] w-[140%] fill-snow">
          <path d="M0 80C30 74 50 44 100 40S170 18 215 30 300 48 345 26C380 30 390 66 400 80Z" />
        </svg>
      </div>

      <h1 className="text-2xl sm:text-3xl">This page got caught in an avalanche.</h1>
      <p className="max-w-sm text-fg-muted">We&apos;re still digging. It may have moved, or you may not have access to it.</p>
      <Button asChild>
        <Link href="/">Back to the Ecosystem Hub</Link>
      </Button>
    </div>
  )
}
