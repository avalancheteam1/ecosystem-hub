// Pure key helpers (no provider/env), unit-tested.

const UUID_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/

/** Exactly `category/ownerId/<uuid>.<ext>` - rejects `..`, sub-paths and other extensions. */
export function isOwnUploadKey(key: string, category: string, ownerId: string): boolean {
  const prefix = `${category}/${ownerId}/`
  return key.startsWith(prefix) && UUID_FILE.test(key.slice(prefix.length))
}
