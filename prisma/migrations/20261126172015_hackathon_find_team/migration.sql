-- AlterTable
ALTER TABLE "project_invites" ADD COLUMN     "inviteeUserId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "hackathon_team_seekers" (
    "participantId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "trackIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hackathon_team_seekers_pkey" PRIMARY KEY ("participantId")
);

-- CreateIndex
CREATE INDEX "project_invites_inviteeUserId_idx" ON "project_invites"("inviteeUserId");

-- AddForeignKey
ALTER TABLE "hackathon_team_seekers" ADD CONSTRAINT "hackathon_team_seekers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "hackathon_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_inviteeUserId_fkey" FOREIGN KEY ("inviteeUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
