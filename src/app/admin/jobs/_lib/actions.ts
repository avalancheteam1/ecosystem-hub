'use server'

import { logger } from '@/lib/logger'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { JOBS } from '@/lib/jobs'
import { enqueueJob } from '@/lib/jobs/boss'

export const runJobNow = action({ schema: z.object({ name: z.string() }), permission: 'superAdmin' }, async ({ name }, user) => {
  if (!JOBS.some((j) => j.name === name)) throw new ActionError('Unknown job')
  try {
    await enqueueJob(name)
  } catch (err) {
    logger.error({ err }, '[jobs] enqueue failed')
    throw new ActionError('Could not enqueue - has the worker ever started against this database?')
  }
  await recordAudit({ actorId: user.id, action: 'job.run', entityType: 'Job', entityId: name })
  return null
})
