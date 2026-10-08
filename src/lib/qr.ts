import QRCode from 'qrcode'

// QR codes as self-contained SVG, ported from the member portal (src/lib/qr.ts
// there) without its custom-logo variants — the hub only uses the team1 symbol.

// Team1 symbol inlined with explicit fills (no <style> classes, which would
// clash when several QR SVGs are inlined on one page).
const LOGO_VIEWBOX = '0 0 150.83 263.76'
const LOGO_PATHS =
  '<path fill="#e6212f" d="M150.78,5.84v119.22c0,2.6-2.1,4.7-4.7,4.7h-39.44c-2.59,0-4.69-2.11-4.69-4.7V53.59c0-2.59-2.1-4.7-4.7-4.7h-27.23c-2.59,0-4.69-2.11-4.69-4.7V4.7c0-2.6,2.1-4.7,4.69-4.7h74.92c3.22,0,5.83,2.61,5.83,5.84Z"/>' +
  '<path fill="#fff" d="M150.83,219.57v39.49c0,2.6-2.1,4.7-4.7,4.7h-51.22c-32.39,0-58.64-26.29-58.64-58.72v-65.4c0-2.6-2.1-4.7-4.7-4.7H4.7c-2.59,0-4.7-2.11-4.7-4.7v-39.49c0-2.59,2.1-4.7,4.7-4.7h26.88c2.59,0,4.7-2.11,4.7-4.7v-10.34c0-2.6,2.1-4.7,4.69-4.7h39.44c2.59,0,4.7,2.11,4.7,4.7v132.52c0,6.26,5.07,11.34,11.32,11.34h49.71c2.59,0,4.7,2.11,4.7,4.7Z"/>'

export type QrOptions = {
  /** Rendered width/height in px (SVG attrs + PNG raster size). */
  size?: number
  /** light = black modules on white; dark = white modules on black. */
  mode?: 'light' | 'dark'
  /** Draw the team1 badge in the middle (default true). */
  logo?: boolean
  /** Omit the background rect so the code floats on whatever it's placed on (default false). */
  transparent?: boolean
}

const QUIET_ZONE = 3 // modules of padding around the code
const BADGE_FRACTION = 0.24 // badge width relative to code width; safe with EC level H (30%)

/** Build a self-contained QR SVG string for `value`. Pure — safe in tests and on the server. */
export function buildQrSvg(value: string, { size = 2000, mode = 'light', logo = true, transparent = false }: QrOptions = {}): string {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: 'H' })
  const n = modules.size
  const total = n + QUIET_ZONE * 2
  const bg = mode === 'dark' ? '#000' : '#fff'
  const fg = mode === 'dark' ? '#fff' : '#000'

  let d = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (modules.get(x, y)) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    }
  }

  let badge = ''
  if (logo) {
    // Opaque black rounded badge masks the modules underneath (recoverable thanks to EC level H).
    const bw = total * BADGE_FRACTION
    const bx = (total - bw) / 2
    const r = bw * 0.18
    const border = mode === 'dark' ? `<rect x="${bx}" y="${bx}" width="${bw}" height="${bw}" rx="${r}" fill="none" stroke="#fff" stroke-width="${total / 250}"/>` : ''
    // The symbol is tall (ratio ~0.57): fit to ~60% of badge height, centered.
    const lh = bw * 0.6
    const lw = lh * (150.83 / 263.76)
    badge =
      `<rect x="${bx}" y="${bx}" width="${bw}" height="${bw}" rx="${r}" fill="#000"/>` +
      border +
      `<svg x="${(total - lw) / 2}" y="${(total - lh) / 2}" width="${lw}" height="${lh}" viewBox="${LOGO_VIEWBOX}">${LOGO_PATHS}</svg>`
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${total} ${total}">` +
    (transparent ? '' : `<rect width="${total}" height="${total}" fill="${bg}"/>`) +
    `<path d="${d}" fill="${fg}"/>` +
    badge +
    `</svg>`
  )
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export function downloadQrSvg(svg: string, filename: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  triggerDownload(url, filename)
  URL.revokeObjectURL(url)
}

/** Rasterize the SVG at its declared size and download as PNG. */
export function downloadQrPng(svg: string, size: number, filename: string) {
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    canvas.getContext('2d')!.drawImage(img, 0, 0, size, size)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      triggerDownload(url, filename)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
