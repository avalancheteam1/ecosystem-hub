export interface PutInput {
  key: string
  body: Buffer
  contentType: string
}

export interface StorageProvider {
  put(input: PutInput): Promise<void>
  delete(key: string): Promise<void>
  /** Absolute public URL for an object key. */
  publicUrl(key: string): string
  /** Inverse of publicUrl: the key for one of OUR URLs, else null (used for ownership checks + cleanup). */
  keyFromUrl(url: string): string | null
}
