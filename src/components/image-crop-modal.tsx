'use client'

import { useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Crop to the exact aspect, then re-encode (strips EXIF/animation) under the
// byte limit - so the server's strict shape check always passes.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the image'))
    img.src = src
  })
}

async function cropToBlob(src: string, area: Area, aspect: number, maxDimension: number, maxBytes: number): Promise<Blob> {
  const img = await loadImage(src)
  const longest = Math.min(Math.round(Math.max(area.width, area.height)), maxDimension)
  const w = aspect >= 1 ? longest : Math.round(longest * aspect)
  const h = aspect >= 1 ? Math.round(longest / aspect) : longest
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser cannot process images')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, w, h)
  let blob: Blob | null = null
  for (const q of [0.9, 0.8, 0.7, 0.6]) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q))
    if (blob && blob.size <= maxBytes) return blob
  }
  if (blob) return blob
  throw new Error('Could not process the image')
}

type Props = {
  file: File | null
  aspect: number
  shape: 'round' | 'rect'
  maxDimension: number
  maxBytes: number
  title: string
  onClose: () => void
  onCropped: (file: File) => Promise<boolean>
}

export function ImageCropModal(props: Props) {
  const { file, title, onClose } = props
  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Drag to position, use the slider to zoom.</DialogDescription>
        </DialogHeader>
        {src && <CropArea key={src} src={src} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

/** Keyed by the image, so crop/zoom reset for every new file. */
function CropArea({ src, aspect, shape, maxDimension, maxBytes, onClose, onCropped }: Props & { src: string }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <div className="relative h-72 overflow-hidden rounded-lg bg-surface-1">
        <Cropper image={src} crop={crop} zoom={zoom} aspect={aspect} cropShape={shape} showGrid={false} objectFit="contain" onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
      </div>
      <label className="flex items-center gap-3 text-sm text-fg-muted">
        Zoom
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-11 flex-1 accent-[var(--color-brand)]" />
      </label>
      <DialogFooter>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button
          disabled={busy || !area}
          onClick={async () => {
            if (!area) return
            setBusy(true)
            try {
              const blob = await cropToBlob(src, area, aspect, maxDimension, maxBytes)
              if (await onCropped(new File([blob], 'image.jpg', { type: 'image/jpeg' }))) onClose()
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Uploading…' : 'Use image'}
        </Button>
      </DialogFooter>
    </>
  )
}
