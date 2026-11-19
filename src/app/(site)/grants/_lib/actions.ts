'use server'

import { revalidatePath } from 'next/cache'
import { action } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { createSchema, mutationSchema } from './schemas'
import { createGrant, mutateGrant } from './store'

export const createApplication = action({ schema: createSchema, permission: 'user' }, async (input, user) => {
  const result = await createGrant(input.projectId, input.roundId, input.answers, user, input.submit)
  await recordAudit({
    actorId: user.id,
    action: 'grant.create',
    entityType: 'GrantApplication',
    entityId: result.id,
    after: { projectId: input.projectId, roundId: input.roundId, submitted: input.submit, revision: 0 },
  })
  revalidatePath('/grants/applications')
  return result
})

export const changeApplication = action({ schema: mutationSchema, permission: 'user' }, async (input, user) => {
  const result = await mutateGrant(input.applicationId, input.revision, input.command, user)
  await recordAudit({
    actorId: user.id,
    action: `grant.${input.command.kind}`,
    entityType: 'GrantApplication',
    entityId: result.id,
    before: { revision: input.revision },
    after: {
      revision: result.revision,
      ...(input.command.kind === 'release_review_status' ? { applicantStatus: input.command.status } : {}),
    },
  })
  revalidatePath('/grants', 'layout')
  revalidatePath('/admin/grants', 'layout')
  return result
})
