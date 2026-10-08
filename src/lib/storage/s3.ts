import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { PutInput, StorageProvider } from './types'

// Cloudflare R2 via its S3-compatible API (same setup as the member portal).

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var ${name}`)
  return v
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client
  private readonly bucket = required('STORAGE_S3_BUCKET')
  private readonly base = required('STORAGE_PUBLIC_BASE_URL').replace(/\/+$/, '')

  constructor() {
    this.client = new S3Client({
      region: process.env.STORAGE_S3_REGION || 'auto',
      endpoint: required('STORAGE_S3_ENDPOINT'),
      forcePathStyle: true, // required for R2 with a custom endpoint
      credentials: { accessKeyId: required('STORAGE_S3_ACCESS_KEY_ID'), secretAccessKey: required('STORAGE_S3_SECRET_ACCESS_KEY') },
    })
  }

  async put({ key, body, contentType }: PutInput) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }))
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  publicUrl(key: string) {
    return `${this.base}/${key}`
  }

  keyFromUrl(url: string) {
    const prefix = `${this.base}/`
    return url.startsWith(prefix) ? url.slice(prefix.length) : null
  }
}
