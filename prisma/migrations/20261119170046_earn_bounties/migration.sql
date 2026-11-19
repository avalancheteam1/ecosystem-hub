-- CreateEnum
CREATE TYPE "EarnSubmissionPolicy" AS ENUM ('single', 'resubmit', 'multiple');

-- CreateEnum
CREATE TYPE "EarnSubmissionStatus" AS ENUM ('pending', 'needs_review', 'changes_requested', 'rejected', 'approved', 'withdrawn');

-- CreateEnum
CREATE TYPE "EarnReviewDecision" AS ENUM ('needs_review', 'changes_requested', 'rejected', 'approved');

-- CreateTable
CREATE TABLE "earn_bounties" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL,
    "participation" TEXT NOT NULL,
    "participationUrl" TEXT,
    "category" TEXT NOT NULL,
    "reward" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "hubModule" TEXT,
    "githubIssueUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "terms" TEXT,
    "termsVersion" INTEGER NOT NULL DEFAULT 1,
    "resultsAnnouncedAt" TIMESTAMP(3),
    "resultsNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "earn_bounties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_stages" (
    "id" UUID NOT NULL,
    "bountyId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL,
    "requiresPrevApproval" BOOLEAN NOT NULL DEFAULT true,
    "requiresPullRequest" BOOLEAN NOT NULL DEFAULT false,
    "submissionPolicy" "EarnSubmissionPolicy" NOT NULL DEFAULT 'resubmit',
    "approvalLimit" INTEGER,

    CONSTRAINT "earn_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_submissions" (
    "id" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "contributorId" TEXT NOT NULL,
    "status" "EarnSubmissionStatus" NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "earn_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_submission_revisions" (
    "submissionId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "links" TEXT[],
    "pullRequests" TEXT[],
    "changeNote" TEXT,
    "termsVersion" INTEGER NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalReason" TEXT,

    CONSTRAINT "earn_submission_revisions_pkey" PRIMARY KEY ("submissionId","number")
);

-- CreateTable
CREATE TABLE "earn_reviews" (
    "id" TEXT NOT NULL,
    "submissionId" UUID NOT NULL,
    "reviewerId" TEXT,
    "revision" INTEGER NOT NULL,
    "decision" "EarnReviewDecision" NOT NULL,
    "feedback" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earn_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earn_awards" (
    "id" UUID NOT NULL,
    "bountyId" UUID NOT NULL,
    "submissionId" UUID,
    "reward" TEXT NOT NULL,
    "rewardedAt" TIMESTAMP(3),
    "rewardNote" TEXT,

    CONSTRAINT "earn_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "earn_bounties_publishedAt_deadline_id_idx" ON "earn_bounties"("publishedAt", "deadline", "id");

-- CreateIndex
CREATE INDEX "earn_bounties_deadline_id_idx" ON "earn_bounties"("deadline", "id");

-- CreateIndex
CREATE INDEX "earn_bounties_updatedAt_id_idx" ON "earn_bounties"("updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "earn_stages_bountyId_position_key" ON "earn_stages"("bountyId", "position");

-- CreateIndex
CREATE INDEX "earn_submissions_stageId_contributorId_idx" ON "earn_submissions"("stageId", "contributorId");

-- CreateIndex
CREATE INDEX "earn_submissions_contributorId_updatedAt_id_idx" ON "earn_submissions"("contributorId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "earn_submissions_stageId_status_idx" ON "earn_submissions"("stageId", "status");

-- CreateIndex
CREATE INDEX "earn_submissions_status_updatedAt_id_idx" ON "earn_submissions"("status", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "earn_reviews_submissionId_revision_createdAt_idx" ON "earn_reviews"("submissionId", "revision", "createdAt");

-- CreateIndex
CREATE INDEX "earn_reviews_reviewerId_idx" ON "earn_reviews"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "earn_awards_submissionId_key" ON "earn_awards"("submissionId");

-- CreateIndex
CREATE INDEX "earn_awards_bountyId_id_idx" ON "earn_awards"("bountyId", "id");

-- AddForeignKey
ALTER TABLE "earn_stages" ADD CONSTRAINT "earn_stages_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "earn_bounties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_submissions" ADD CONSTRAINT "earn_submissions_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "earn_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_submissions" ADD CONSTRAINT "earn_submissions_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_submission_revisions" ADD CONSTRAINT "earn_submission_revisions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "earn_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_reviews" ADD CONSTRAINT "earn_reviews_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "earn_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_reviews" ADD CONSTRAINT "earn_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_awards" ADD CONSTRAINT "earn_awards_bountyId_fkey" FOREIGN KEY ("bountyId") REFERENCES "earn_bounties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earn_awards" ADD CONSTRAINT "earn_awards_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "earn_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
