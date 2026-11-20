export const DEMO_VIDEO_HINT = 'Use a direct YouTube, Loom or Vimeo video link, not a channel or homepage.'

/** No fetch, embed, third-party script or thumbnail. Canonical links are safe to render under the existing CSP. */
export function videoPreview(value: string): { provider: string; id: string; url: string } | null {
  let u: URL
  try { u = new URL(value.trim()) } catch { return null }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname.replace(/\/$/, '')
  if (['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? path.slice(1) : path === '/watch' ? u.searchParams.get('v') : path.match(/^\/(?:shorts|embed)\/([\w-]{11})$/)?.[1] ?? null
    if (id && /^[\w-]{11}$/.test(id)) return { provider: 'YouTube', id, url: `https://www.youtube.com/watch?v=${id}` }
  }
  if (host === 'loom.com') {
    const id = path.match(/^\/(?:share|embed)\/([a-f0-9]{32})$/i)?.[1]
    if (id) return { provider: 'Loom', id, url: `https://www.loom.com/share/${id}` }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const match = path.match(/^\/(?:video\/)?(\d+)(?:\/([a-f0-9]+))?$/i)
    const hash = match?.[2] ?? u.searchParams.get('h')
    if (match) return { provider: 'Vimeo', id: match[1]!, url: `https://vimeo.com/${match[1]}${hash && /^[a-f0-9]+$/i.test(hash) ? `/${hash}` : ''}` }
  }
  return null
}
