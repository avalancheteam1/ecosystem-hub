import { z } from 'zod'
import { requireApiKey, v1Error, v1Json } from '@/lib/api-keys'
import { prisma } from '@/lib/db'

// POST /api/v1/users/check — scope users:check
// Body: { emailHash: sha256hex(lower(trim(email))) } → { exists: boolean }
// Takes a hash, never a plain email, so callers don't send us addresses we don't have.

const bodySchema = z.object({ emailHash: z.string().regex(/^[0-9a-f]{64}$/, 'emailHash must be a lowercase sha256 hex digest') })

export async function POST(request: Request) {
  const key = await requireApiKey(request, 'users:check')
  if (key instanceof Response) return key

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return v1Error(422, parsed.error.issues[0]?.message ?? 'Invalid body')

  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM users WHERE encode(sha256(convert_to(lower(trim(email)), 'UTF8')), 'hex') = ${parsed.data.emailHash}
    ) AS "exists"`
  return v1Json({ exists })
}
