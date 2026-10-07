'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

// `nonce`: next-themes injects an inline script that must carry the CSP nonce (src/proxy.ts).
export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange nonce={nonce}>
      {children}
    </NextThemesProvider>
  )
}
