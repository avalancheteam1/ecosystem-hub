import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PutInput, StorageProvider } from './types'

// Development only: files under public/uploads/ (git-ignored), served by Next.
// Lets uploads work without R2 credentials. Never used in production.

const ROOT = path.join(process.cwd(), 'public', 'uploads')
const base = () => `${(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')}/uploads`

export class LocalStorageProvider implements StorageProvider {
  async put({ key, body }: PutInput) {
    const file = path.join(ROOT, key)
    if (!file.startsWith(ROOT + path.sep)) throw new Error('Invalid key')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, body)
  }

  async delete(key: string) {
    const file = path.join(ROOT, key)
    if (file.startsWith(ROOT + path.sep)) await rm(file, { force: true })
  }

  publicUrl(key: string) {
    return `${base()}/${key}`
  }

  keyFromUrl(url: string) {
    const prefix = `${base()}/`
    return url.startsWith(prefix) ? url.slice(prefix.length) : null
  }
}
