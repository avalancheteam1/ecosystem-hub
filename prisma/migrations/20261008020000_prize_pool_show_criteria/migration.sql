ALTER TABLE "hackathons" ADD COLUMN "prizePool" TEXT;
ALTER TABLE "hackathon_stages" ADD COLUMN "showCriteria" BOOLEAN NOT NULL DEFAULT true;
