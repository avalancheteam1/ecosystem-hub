'use server'

import { revalidatePath } from 'next/cache'
import { action } from '@/lib/action'
import { ActionError } from '@/lib/action-error'
import { recordAudit } from '@/lib/audit'
import { requireFlag } from '@/lib/flag-store'
import { shortIntakeEnabled } from './config'
import { createSchema, mutationSchema, payoutDestinationSchema, startSchema } from './schemas'
import { confirmGrantPayoutDestination, createGrant, mutateGrant, startGrant, usesTransactionalGrantAudit } from './store'

export const confirmPayoutDestination = action({ schema: payoutDestinationSchema, permission: 'user' }, async (input, user) => {
  await requireFlag('grants')
  await confirmGrantPayoutDestination(input, user)
  revalidatePath(`/grants/applications/${input.applicationId}`)
  revalidatePath(`/admin/grants/applications/${input.applicationId}`)
})

export const startApplication = action({ schema: startSchema, permission: 'user' }, async ({ projectId }, user) => {
  await requireFlag('grants')
  const { id, created } = await startGrant(projectId, user)
  if (created) revalidatePath('/grants/applications')
  return { id }
})

export const createApplication = action({ schema: createSchema, permission: 'user' }, async (input, user) => {
  await requireFlag('grants')
  await requireFlag('grantsRoundManagement')
  if (shortIntakeEnabled() && input.answers.intakeVersion !== 2) throw new ActionError('Reload to use the short form for a new application.')
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
  await requireFlag('grants')
  const result = await mutateGrant(input.applicationId, input.revision, input.command, user)
  if (!usesTransactionalGrantAudit(input.command.kind)) await recordAudit({
    actorId: user.id,
    action: `grant.${input.command.kind}`,
    entityType: 'GrantApplication',
    entityId: result.id,
    before: { revision: input.revision },
    after: {
      revision: result.revision,
      ...(input.command.kind === 'release_review_status' ? { applicantStatus: input.command.status } : {}),
      ...('planId' in input.command && input.command.planId ? { planId: input.command.planId } : {}),
      ...('milestoneId' in input.command && input.command.milestoneId ? { milestoneId: input.command.milestoneId } : {}),
    },
  })
  revalidatePath('/grants', 'layout')
  revalidatePath('/admin/grants', 'layout')
  return result
})
