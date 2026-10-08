import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Kanit } from 'next/font/google'
import { headers } from 'next/headers'
import Script from 'next/script'
import { ThemeProvider } from '@/components/layout/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const kanit = Kanit({ subsets: ['latin', 'latin-ext'], weight: ['300', '400', '500', '600'], variable: '--font-kanit' })
// Metadata layer only (dates, counts, numbering) — Kanit stays the brand face.
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-jetbrains' })

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://hub.team1.network'
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'Team1 Ecosystem Hub', template: '%s · team1 Ecosystem Hub' },
  description: 'Hackathons, workshops, bounties and education for builders in the Avalanche ecosystem — by team1.',
  openGraph: { type: 'website', siteName: 'team1 Ecosystem Hub' },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#0b0a0f',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="en" className={`${kanit.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://wal.team1.network/js/script.js"
            strategy="afterInteractive"
            nonce={nonce}
          />
        )}
      </body>
    </html>
  )
}
