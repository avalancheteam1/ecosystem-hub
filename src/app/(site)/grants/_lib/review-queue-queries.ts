import 'server-only'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requirePermission } from '@/lib/guards'
import { GRANT_PAGE_SIZE } from './queries'
import { applicationStatus } from './rules'
import { stateSchema } from './schemas'
import type { ReviewQueueAction, ReviewQueueFilters } from './review-queue'

type QueueRecord = {
  id: string
  name: string
  maturity: string | null
  roundName: string | null
  roundOpen: boolean | null
  updatedAt: Date
  nextAction: ReviewQueueAction
  state: unknown
}

// Match milestonePlan and the pinned version guard. Ordinality preserves the append order when
// attempts share a timestamp. A milestone with no attempt still counts towards completion.
const milestonePlanAction = Prisma.sql`(
  SELECT CASE
    WHEN g.state #>> '{planApproval,planId}' = pinned.plan->>'id'
      AND g.state #>> '{planApproval,projectVersionId}' = g."projectVersionId"
      AND pinned.plan->>'projectVersionId' = g."projectVersionId"
    THEN (
      SELECT CASE
        WHEN bool_or(latest.state = 'submitted') THEN 'verification'
        WHEN bool_and(COALESCE(latest.state = 'accepted', false)) THEN 'decision'
        ELSE 'applicant'
      END
      FROM jsonb_array_elements(pinned.plan #> '{answers,milestones}') AS item(milestone)
      LEFT JOIN LATERAL (
        SELECT attempt.delivery->>'state' AS state
        FROM jsonb_array_elements(g.state->'deliveries') WITH ORDINALITY AS attempt(delivery, position)
        WHERE attempt.delivery->>'planId' = pinned.plan->>'id'
          AND attempt.delivery->>'milestoneId' = item.milestone->>'milestoneId'
        ORDER BY attempt.position DESC
        LIMIT 1
      ) latest ON true
    )
    ELSE 'review'
  END
  FROM (SELECT g.state->'applications'->-1 AS plan) pinned
)`

// These lanes describe the current workflow, independent of the viewer's write permissions.
// Extend this classification and its persisted transition tests together as the lifecycle changes.
// A published recommendation alone does not make a case ready for a decision.
const nextAction = Prisma.sql`CASE
  WHEN g.state->>'closedAt' IS NOT NULL OR g.status IN ('deferred', 'not_selected', 'withdrawn') THEN 'inactive'
  WHEN g.status = 'submitted' THEN CASE
    WHEN jsonb_path_exists(g.state, '$.requests[*] ? (@.answeredAt == null)') THEN 'applicant'
    WHEN g.state->>'version' = '4' THEN ${milestonePlanAction}
    WHEN g.state->>'version' <> '3' OR g.state->>'milestoneClearance' IS NULL THEN 'review'
    WHEN g.state->'deliveries'->-1->>'state' = 'submitted' THEN 'verification'
    WHEN g.state->'deliveries'->-1->>'state' = 'accepted' THEN 'decision'
    ELSE 'applicant'
  END
  WHEN g.status = 'approved' THEN CASE
    WHEN g.state->>'version' IN ('3', '4') THEN 'operations'
    WHEN NOT jsonb_path_exists(g.state, '$.terms[*] ? (@.confirmedAt != null)') THEN 'applicant'
    WHEN jsonb_path_exists(g.state, '$.amendments[*] ? (@.state == "approved" || @.state == "changes_requested")') THEN 'applicant'
    WHEN jsonb_path_exists(g.state, '$.amendments[*] ? (@.state == "submitted")') THEN 'review'
    WHEN g.state->'deliveries'->-1->>'state' = 'submitted' THEN 'verification'
    WHEN g.state->'deliveries'->-1->>'state' = 'accepted' THEN 'operations'
    ELSE 'applicant'
  END
  ELSE 'inactive'
END`

export async function readReviewQueue({ q, action, page }: ReviewQueueFilters) {
  const user = await requirePermission('grants.review')
  // Do authorization, search, and classification in Postgres before the page limit. Read one extra
  // row for the pager. Keep the aggregate server-side and reuse the released status rules for this page.
  const records = await prisma.$queryRaw<QueueRecord[]>`
    SELECT g.id, v.name, v.maturity, g."updatedAt", g.state, r.name AS "roundName",
      r.published AS "roundOpen", queue."nextAction"
    FROM grant_applications g
    JOIN project_versions v ON v.id = g."projectVersionId"
    LEFT JOIN grant_rounds r ON r.id = g."roundId"
    CROSS JOIN LATERAL (SELECT ${nextAction} AS "nextAction") queue
    WHERE g.status <> 'draft'
      AND NOT EXISTS (
        SELECT 1 FROM project_members m WHERE m."projectId" = g."projectId" AND m."userId" = ${user.id}
      )
      ${q ? Prisma.sql`AND v.name ILIKE ${`%${q}%`}` : Prisma.empty}
      ${action ? Prisma.sql`AND queue."nextAction" = ${action}` : Prisma.empty}
    ORDER BY g."updatedAt" DESC, g.id DESC
    LIMIT ${GRANT_PAGE_SIZE + 1} OFFSET ${(page - 1) * GRANT_PAGE_SIZE}
  `

  return {
    rows: records.slice(0, GRANT_PAGE_SIZE).map(({ state, roundName, roundOpen, ...row }) => ({
      ...row,
      round: roundName === null ? null : { name: roundName, open: Boolean(roundOpen) },
      status: applicationStatus(stateSchema.parse(state)).status,
    })),
    hasMore: records.length > GRANT_PAGE_SIZE,
  }
}

export type ReviewQueuePage = Awaited<ReturnType<typeof readReviewQueue>>
