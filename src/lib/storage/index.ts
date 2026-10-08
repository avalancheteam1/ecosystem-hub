import { randomUUID } from 'node:crypto'
import { isOwnUploadKey } from './keys'
import { LocalStorageProvider } from './local'
import { S3StorageProvider } from './s3'
import type { StorageProvider } from './types'

// Object storage. STORAGE_PROVIDER=s3 (Cloudflare R2, production) or local
// (dev default when no S3 bucket is configured). Lazy: env is read on first
// use, never at import/build time.

let instance: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (!instance) {
    const provider = process.env.STORAGE_PROVIDER || (process.env.STORAGE_S3_BUCKET ? 's3' : 'local')
    if (provider === 's3') instance = new S3StorageProvider()
    else if (provider === 'local' && process.env.NODE_ENV !== 'production') instance = new LocalStorageProvider()
    else throw new Error(`Image storage isn't configured (STORAGE_PROVIDER=${provider})`)
  }
  return instance
}

/** `category/ownerId/<uuid>.ext` — unguessable, and ownership is checkable from the key. */
export function storageKey(category: string, ownerId: string, ext: string): string {
  return `${category}/${ownerId}/${randomUUID()}.${ext}`
}

export function ownerPrefix(category: string, ownerId: string): string {
  return `${category}/${ownerId}/`
}

/** Is `url` one of our uploads in this category for this owner? */
export function isOwnUpload(url: string, category: string, ownerId: string): boolean {
  const key = getStorage().keyFromUrl(url)
  return !!key && isOwnUploadKey(key, category, ownerId)
}

export type { PutInput, StorageProvider } from './types'
