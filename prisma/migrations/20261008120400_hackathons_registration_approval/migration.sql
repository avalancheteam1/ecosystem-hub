-- AlterTable
ALTER TABLE "hackathons" ADD COLUMN     "inviteToken" TEXT,
ADD COLUMN     "requireApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "hackathons_inviteToken_key" ON "hackathons"("inviteToken");

