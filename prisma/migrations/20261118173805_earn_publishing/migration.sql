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

    CONSTRAINT "earn_bounties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "earn_bounties_publishedAt_deadline_id_idx" ON "earn_bounties"("publishedAt", "deadline", "id");

-- CreateIndex
CREATE INDEX "earn_bounties_deadline_id_idx" ON "earn_bounties"("deadline", "id");

-- CreateIndex
CREATE INDEX "earn_bounties_updatedAt_id_idx" ON "earn_bounties"("updatedAt", "id");
