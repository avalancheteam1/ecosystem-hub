'use client'

import { useMemo, useState } from 'react'
import { Download, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildQrSvg, downloadQrPng, downloadQrSvg } from '@/lib/qr'

const SIZE = 2000

/**
 * QR code for `value` with light/dark mode, transparent background and SVG/PNG
 * download (same behaviour as the member portal's QrCodeModal). `filename` is
 * the download base name without extension.
 */
export function QrCodeDialog({ value, filename, title = 'QR code', label = 'QR code' }: { value: string; filename: string; title?: string; label?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={label} title={label}><QrCode aria-hidden /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <QrCodePanel value={value} filename={filename} />
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's body on its own — mount it only while visible (it builds a 2000px SVG). */
export function QrCodePanel({ value, filename }: { value: string; filename: string }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [transparent, setTransparent] = useState(false)
  const svg = useMemo(() => buildQrSvg(value, { size: SIZE, mode, transparent }), [value, mode, transparent])
  const name = `${filename}-${mode}${transparent ? '-transparent' : ''}`

  return (
    <div className="space-y-5">
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'light' | 'dark')}>
        <TabsList>
          <TabsTrigger value="light">Light</TabsTrigger>
          <TabsTrigger value="dark">Dark</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, not an asset */}
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        alt={`QR code for ${value}`}
        className="mx-auto aspect-square w-full max-w-96 rounded-lg border border-line"
        // Checkerboard so a transparent code stays visible in both themes.
        style={transparent ? { background: 'repeating-conic-gradient(#888 0 25%, #ccc 0 50%) 0 0 / 20px 20px' } : undefined}
      />
      <p className="break-all text-center text-xs text-fg-muted">{value}</p>
      <label className="flex min-h-11 items-center justify-center gap-3 text-sm">
        <Checkbox checked={transparent} onCheckedChange={(c) => setTransparent(c === true)} /> Transparent background
      </label>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={() => downloadQrSvg(svg, `${name}.svg`)}><Download aria-hidden /> SVG</Button>
        <Button variant="outline" onClick={() => downloadQrPng(svg, SIZE, `${name}.png`)}><Download aria-hidden /> PNG</Button>
      </div>
    </div>
  )
}
