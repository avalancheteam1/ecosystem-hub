import { PlayCircle } from 'lucide-react'
import { videoPreview } from '@/lib/demo-video'

export function DemoVideoPreview({ url }: { url: string | null }) {
  const video = url ? videoPreview(url) : null
  if (!video) return null
  return <a href={video.url} target="_blank" rel="noreferrer nofollow" aria-label={`Preview demo video on ${video.provider}`} className="flex min-h-24 max-w-full items-center gap-4 overflow-hidden rounded-xl border border-line bg-surface-1 p-4 hover:border-brand"><PlayCircle aria-hidden className="size-10 shrink-0 text-brand" /><span className="min-w-0"><span className="block text-fg-heading">Demo video · {video.provider}</span><span className="mt-1 block truncate text-sm text-fg-muted">{video.id}</span><span className="block text-xs text-fg-faint">Open preview to check this is the right video</span></span></a>
}
