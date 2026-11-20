import { z } from 'zod'
import { REJECT_REASON_MAX } from './rules'

const id = z.string().min(1).max(100)

export const submitListingSchema = z.object({
  projectId: id,
  consent: z.literal(true, { error: 'Agree to the public listing first' }),
})
export const withdrawListingSchema = z.object({ projectId: id })

/** The page's view of the listing travels with every review, so a stale page or a second reviewer is refused, not applied. */
const seen = { listingId: id, approvedVersionId: id.nullable(), pendingVersionId: id.nullable() }
export const approveListingSchema = z.object({ ...seen, versionId: id })
export const rejectListingSchema = z.object({
  ...seen,
  reason: z.string().trim().max(REJECT_REASON_MAX).optional().transform((v) => v || null),
  internal: z.boolean(),
})
export const removeListingSchema = z.object({
  ...seen,
  reason: z.string().trim().min(1, 'Say why it is removed - the team sees this').max(REJECT_REASON_MAX),
})
