/*
  Warnings:

  - A unique constraint covering the columns `[sponsorPrizeId]` on the table `hackathon_prizes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "hackathon_prizes" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "sponsorPrizeId" TEXT;

-- AlterTable
ALTER TABLE "hackathon_submissions" ADD COLUMN     "sponsorPrizeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "hackathons" ADD COLUMN     "optionalProjectFields" TEXT[] DEFAULT ARRAY['videoUrl']::TEXT[];

-- CreateTable
CREATE TABLE "hackathon_sponsor_prizes" (
    "id" TEXT NOT NULL,
    "hackathonId" TEXT NOT NULL,
    "sponsor" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eligibilityHint" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hackathon_sponsor_prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hackathon_projects" (
    "hackathonId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_projects_pkey" PRIMARY KEY ("hackathonId","projectId")
);

-- CreateIndex
CREATE INDEX "hackathon_sponsor_prizes_hackathonId_idx" ON "hackathon_sponsor_prizes"("hackathonId");

-- CreateIndex
CREATE INDEX "hackathon_projects_projectId_idx" ON "hackathon_projects"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "hackathon_prizes_sponsorPrizeId_key" ON "hackathon_prizes"("sponsorPrizeId");

-- AddForeignKey
ALTER TABLE "hackathon_sponsor_prizes" ADD CONSTRAINT "hackathon_sponsor_prizes_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_prizes" ADD CONSTRAINT "hackathon_prizes_sponsorPrizeId_fkey" FOREIGN KEY ("sponsorPrizeId") REFERENCES "hackathon_sponsor_prizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_projects" ADD CONSTRAINT "hackathon_projects_hackathonId_fkey" FOREIGN KEY ("hackathonId") REFERENCES "hackathons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hackathon_projects" ADD CONSTRAINT "hackathon_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the visibility of existing results when moving to independent publication.
UPDATE "hackathon_prizes" AS p
SET "publishedAt" = h."resultsPublishedAt"
FROM "hackathons" AS h
WHERE p."hackathonId" = h."id" AND h."resultsPublishedAt" IS NOT NULL;

-- CreateTable
CREATE TABLE "hackathon_submission_team_changes" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeTeam" JSONB NOT NULL,
    "afterTeam" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hackathon_submission_team_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hackathon_submission_team_changes_entryId_createdAt_idx" ON "hackathon_submission_team_changes"("entryId", "createdAt");

-- AddForeignKey
ALTER TABLE "hackathon_submission_team_changes" ADD CONSTRAINT "hackathon_submission_team_changes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "hackathon_stage_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "hackathon_stages" ADD COLUMN     "scaleMin" INTEGER NOT NULL DEFAULT 0;


ALTER TABLE "hackathon_stages" ADD CONSTRAINT "hackathon_stages_score_scale_check"
CHECK ("scaleMin" IN (0, 1) AND "scaleMax" > "scaleMin");
