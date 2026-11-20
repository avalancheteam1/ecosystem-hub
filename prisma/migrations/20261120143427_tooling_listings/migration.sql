-- CreateTable
CREATE TABLE "tooling_listings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "approvedVersionId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "pendingVersionId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentById" TEXT,
    "rejectedVersionId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectReason" TEXT,
    "rejectReasonInternal" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedReason" TEXT,
    "closedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tooling_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tooling_listings_projectId_key" ON "tooling_listings"("projectId");

-- AddForeignKey
ALTER TABLE "tooling_listings" ADD CONSTRAINT "tooling_listings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooling_listings" ADD CONSTRAINT "tooling_listings_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "project_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooling_listings" ADD CONSTRAINT "tooling_listings_pendingVersionId_fkey" FOREIGN KEY ("pendingVersionId") REFERENCES "project_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
