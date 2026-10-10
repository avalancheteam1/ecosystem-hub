import type { ImageRules } from '@/lib/image-upload'

// Every kind of uploadable image: rules (shared by the crop UI and the server
// check) + the storage category. Who may upload is decided in upload-actions.ts.
// Pure - safe to import on the client.

export const IMAGE_KINDS = {
  avatar: { category: 'avatars', aspect: 1, maxDimension: 1000, maxBytes: 1_000_000, shape: 'round' },
  'project-logo': { category: 'project-logos', aspect: 1, maxDimension: 1000, maxBytes: 1_000_000, shape: 'rect' },
  'project-cover': { category: 'project-covers', aspect: 16 / 9, maxDimension: 1600, maxBytes: 2_000_000, shape: 'rect' },
  'project-screenshot': { category: 'project-screenshots', aspect: 16 / 9, maxDimension: 1600, maxBytes: 2_000_000, shape: 'rect' },
  'sponsor-logo': { category: 'sponsor-logos', aspect: 1, maxDimension: 600, maxBytes: 1_000_000, shape: 'rect' },
} as const satisfies Record<string, ImageRules & { category: string; shape: 'round' | 'rect' }>

export type ImageKind = keyof typeof IMAGE_KINDS
export const IMAGE_KIND_KEYS = Object.keys(IMAGE_KINDS) as [ImageKind, ...ImageKind[]]
