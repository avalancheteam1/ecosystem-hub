import type { Metadata } from 'next'
import { alt, contentType, size } from '@/app/opengraph-image'

/** Open Graph fields every page keeps: a page's own `openGraph` replaces the layout's whole object (shallow merge). */
export const OPEN_GRAPH = { type: 'website', siteName: 'team1 Ecosystem Hub' } as const

/**
 * Canonical URL + og:url for a public page - share links (`?ref=`) and filter params point back to it. Relative paths resolve against `metadataBase`.
 * Setting `openGraph` here also drops the file-based src/app/opengraph-image, so it is the default image again
 * - with its size/type/alt, which scrapers (Facebook, LinkedIn) need to show the large card on first share.
 */
const DEFAULT_IMAGE = { url: '/opengraph-image', ...size, alt, type: contentType }

export function canonical(path: string, openGraph?: Metadata['openGraph']): Pick<Metadata, 'alternates' | 'openGraph'> {
  return { alternates: { canonical: path }, openGraph: { ...OPEN_GRAPH, images: DEFAULT_IMAGE, ...openGraph, url: path } }
}

/** Markdown → one plain line for meta descriptions: link text kept, URLs and markup dropped, whitespace collapsed. */
export function plainText(md: string, max = 160): string {
  const text = md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
