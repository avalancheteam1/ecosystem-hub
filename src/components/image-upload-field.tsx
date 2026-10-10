'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { ImageCropModal } from '@/components/image-crop-modal'
import { Button } from '@/components/ui/button'
import { IMAGE_KINDS, type ImageKind } from '@/lib/image-kinds'
import { uploadImage } from '@/lib/upload-actions'
import { cn } from '@/lib/utils'

const MAX_SOURCE_BYTES = 15_000_000

/**
 * Pick → crop → upload to R2 → `onChange(url)`. The parent form saves the URL.
 * `ownerId`: the project/hackathon id the image belongs to ('new' before a project exists).
 */
export function ImageUploadField({ kind, ownerId, value, onChange, label, className }: { kind: ImageKind; ownerId: string; value: string | null; onChange: (url: string | null) => void; label: string; className?: string }) {
  const rules = IMAGE_KINDS[kind]
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const square = rules.aspect === 1
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={value ? `Change ${label}` : `Upload ${label}`}
        className={cn(
          'group relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-surface-1 transition-colors hover:border-brand',
          square ? 'size-24' : 'aspect-video w-48',
          rules.shape === 'round' ? 'rounded-full' : 'rounded-xl',
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- own CDN upload
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6 text-fg-faint group-hover:text-brand" aria-hidden />
        )}
      </button>
      <div className="space-y-1">
        <p className="text-sm text-fg-body">{label}</p>
        <p className="text-xs text-fg-faint">{square ? 'Square' : '16:9'}, JPG/PNG/WebP - you can crop after picking.</p>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => onChange(null)}>
            <X aria-hidden /> Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (f.size > MAX_SOURCE_BYTES) return void toast.error('That file is too large (max 15 MB)')
          setPicked(f)
        }}
      />
      <ImageCropModal
        file={picked}
        aspect={rules.aspect}
        shape={rules.shape}
        maxDimension={rules.maxDimension}
        maxBytes={rules.maxBytes}
        title={`Crop ${label.toLowerCase()}`}
        onClose={() => setPicked(null)}
        onCropped={async (file) => {
          const fd = new FormData()
          fd.set('kind', kind)
          fd.set('ownerId', ownerId)
          fd.set('file', file)
          const res = await uploadImage(fd)
          if (!res.ok) {
            toast.error(res.error)
            return false
          }
          onChange(res.data.url)
          return true
        }}
      />
    </div>
  )
}
