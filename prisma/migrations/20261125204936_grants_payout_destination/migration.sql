-- CreateTable
CREATE TABLE "grant_payout_destinations" (
    "applicationId" TEXT NOT NULL,
    "awardId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grant_payout_destinations_pkey" PRIMARY KEY ("applicationId")
);

-- AddForeignKey
ALTER TABLE "grant_payout_destinations" ADD CONSTRAINT "grant_payout_destinations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "grant_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
