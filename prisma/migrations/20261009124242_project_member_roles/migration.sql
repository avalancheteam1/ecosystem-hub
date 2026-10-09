-- AlterTable
ALTER TABLE "project_invites" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'writer';

-- AlterTable
ALTER TABLE "project_members" ALTER COLUMN "role" SET DEFAULT 'writer';

-- Existing members could edit and submit: they become writers.
UPDATE "project_members" SET "role" = 'writer' WHERE "role" = 'member';
