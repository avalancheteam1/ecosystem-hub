import 'server-only'
import { createHash } from 'node:crypto'
import type { ProjectVersion } from '@prisma/client'
import type { ReviewedProject } from './schemas'

export function projectReviewSnapshot(version: ProjectVersion): ReviewedProject {
  // Project editors can change a draft in place. Ignore seal and audit metadata.
  const { id, projectId: _projectId, sealedAt: _sealedAt, note: _note, createdById: _author,
    createdAt: _createdAt, updatedAt: _updatedAt, ...content } = version
  const canonical = JSON.stringify(content, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : value,
  )
  return { versionId: id, fingerprint: createHash('sha256').update(canonical).digest('hex') }
}
