-- CreateTable
CREATE TABLE "grant_rounds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "choices" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_applications" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectVersionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grant_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_revisions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grant_payment_references" (
    "reference" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_payment_references_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "grant_round_snapshots" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_round_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grant_applications_projectId_idx" ON "grant_applications"("projectId");

-- CreateIndex
CREATE INDEX "grant_applications_roundId_status_idx" ON "grant_applications"("roundId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grant_applications_roundId_projectId_key" ON "grant_applications"("roundId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "grant_revisions_applicationId_number_key" ON "grant_revisions"("applicationId", "number");

-- CreateIndex
CREATE INDEX "grant_payment_references_applicationId_idx" ON "grant_payment_references"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "grant_round_snapshots_roundId_number_key" ON "grant_round_snapshots"("roundId", "number");

-- AddForeignKey
ALTER TABLE "grant_applications" ADD CONSTRAINT "grant_applications_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "grant_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_applications" ADD CONSTRAINT "grant_applications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_applications" ADD CONSTRAINT "grant_applications_projectVersionId_fkey" FOREIGN KEY ("projectVersionId") REFERENCES "project_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_revisions" ADD CONSTRAINT "grant_revisions_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "grant_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_payment_references" ADD CONSTRAINT "grant_payment_references_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "grant_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grant_round_snapshots" ADD CONSTRAINT "grant_round_snapshots_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "grant_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
